import { getEtag } from "dataverse-schema";
import { openDB } from "idb";

//#region src/tanstack-db/collection.ts
const DEFAULT_SYNC_INTERVAL = 3e4;
function dataverseCollectionOptions(config) {
	const { table, syncInterval = DEFAULT_SYNC_INTERVAL, ...rest } = config;
	const pk = table.primaryKey;
	const getKey = ((item) => item[pk.key]);
	const collectionId = table.entitySetName;
	let pollTimer = null;
	let syncFn = null;
	const defaultOnInsert = async ({ transaction }) => {
		const results = [];
		for (const mutation of transaction.mutations) {
			const guid = await table.createRecord(mutation.modified);
			results.push(guid);
		}
		return results;
	};
	const defaultOnUpdate = async ({ transaction }) => {
		const results = [];
		for (const mutation of transaction.mutations) {
			await table.updateRecord(mutation.key, mutation.changes);
			results.push(mutation.key);
		}
		return results;
	};
	const defaultOnDelete = async ({ transaction }) => {
		const results = [];
		for (const mutation of transaction.mutations) {
			await table.deleteRecord(mutation.key);
			results.push(mutation.key);
		}
		return results;
	};
	const syncConfig = {
		sync: ({ begin, write, commit, markReady, collection }) => {
			syncFn = async () => {
				try {
					const keysToDelete = new Set(collection.keys());
					begin();
					for await (const record of table.iterateRecords()) {
						const key = table.getPrimaryId(record);
						const existingRecord = collection.get(key);
						if (existingRecord) {
							if (getEtag(record) !== getEtag(existingRecord)) write({
								type: "update",
								value: record
							});
							keysToDelete.delete(key);
						} else write({
							type: "insert",
							value: record
						});
					}
					for (const key of keysToDelete) write({
						type: "delete",
						value: collection.get(key)
					});
					commit();
				} catch (err) {
					console.warn(`[dataverse-collection] sync failed for "${collectionId}":`, err);
				} finally {
					markReady();
				}
			};
			syncFn();
			pollTimer = setInterval(() => {
				syncFn?.();
			}, syncInterval);
			return () => {
				if (pollTimer) {
					clearInterval(pollTimer);
					pollTimer = null;
				}
			};
		},
		rowUpdateMode: "partial"
	};
	const utils = {
		forceSync: async () => {
			await syncFn?.();
		},
		table
	};
	return {
		...rest,
		id: collectionId,
		getKey,
		sync: syncConfig,
		onInsert: defaultOnInsert,
		onUpdate: defaultOnUpdate,
		onDelete: defaultOnDelete,
		utils
	};
}

//#endregion
//#region src/tanstack-db/offline-collection.ts
const DEFAULT_POLL_INTERVAL = 3e4;
const MAX_MUTATION_ATTEMPTS = 3;
const RETRY_BASE_DELAY = 1e3;
const RETRY_MAX_DELAY = 6e4;
var MutationPersistenceError = class extends Error {
	mutationIds;
	cause;
	constructor(message, mutationIds, cause) {
		super(message);
		this.mutationIds = mutationIds;
		this.cause = cause;
		this.name = "MutationPersistenceError";
	}
};
var DataverseSyncDB = class {
	name;
	version;
	tables;
	MUTATION_QUEUE_NAME = "Mutations";
	ERRORED_MUTATIONS_NAME = "Errored Mutations";
	channel;
	closed = false;
	activeFetchControllers = /* @__PURE__ */ new Set();
	collectionCleanups = /* @__PURE__ */ new Set();
	channelMessageHandler;
	constructor(name, tables, version) {
		this.name = name;
		this.channel = new BroadcastChannel(name);
		this.version = version;
		this.tables = new Map(tables.map((v) => [v.entitySetName, v]));
		this.channelMessageHandler = (event) => {
			if (event.data?.type === "ABORT_ACTIVE_FETCHES") this.abortActiveFetches();
		};
		this.channel.addEventListener("message", this.channelMessageHandler);
	}
	sequence = 0;
	serializeMutation(mutation) {
		return {
			id: mutation.mutationId,
			type: mutation.type,
			value: mutation.modified,
			key: mutation.key,
			entitySetName: mutation.collection.id,
			timestamp: mutation.createdAt.valueOf(),
			sequence: this.sequence++,
			attempts: 0,
			ifMatch: getEtag(mutation.modified)
		};
	}
	db;
	async getDB() {
		if (!this.db) {
			const self = this;
			this.db = await openDB(this.name, this.version, { upgrade(database, oldVersion, _newVersion, transaction) {
				for (const storeName of Array.from(database.objectStoreNames)) if (storeName !== self.MUTATION_QUEUE_NAME && storeName !== self.ERRORED_MUTATIONS_NAME) database.deleteObjectStore(storeName);
				let store = database.objectStoreNames.contains(self.MUTATION_QUEUE_NAME) ? transaction.objectStore(self.MUTATION_QUEUE_NAME) : database.createObjectStore(self.MUTATION_QUEUE_NAME, { keyPath: "id" });
				if (!store.indexNames.contains("by_timestamp")) store.createIndex("by_timestamp", ["timestamp", "sequence"]);
				if (!database.objectStoreNames.contains(self.ERRORED_MUTATIONS_NAME)) database.createObjectStore(self.ERRORED_MUTATIONS_NAME, { keyPath: "id" });
				for (const table of self.tables.values()) if (!database.objectStoreNames.contains(table.entitySetName)) database.createObjectStore(table.entitySetName, { keyPath: table.primaryKey.key });
			} });
		}
		return this.db;
	}
	/**
	* Instantly aborts any in-flight remote server GET requests across all collections.
	*/
	abortActiveFetches() {
		for (const controller of this.activeFetchControllers) controller.abort("New mutation enqueued");
		this.activeFetchControllers.clear();
	}
	close() {
		if (this.closed) return;
		this.closed = true;
		this.abortActiveFetches();
		for (const cleanup of [...this.collectionCleanups]) cleanup();
		this.collectionCleanups.clear();
		this.channel.removeEventListener("message", this.channelMessageHandler);
		this.channel.close();
		this.db?.close();
		this.db = void 0;
	}
	async flushQueue() {
		await navigator.locks.request(this.name, async () => {
			const db = await this.getDB();
			while (true) {
				const cursor = await db.transaction(this.MUTATION_QUEUE_NAME, "readonly").store.index("by_timestamp").openCursor(null, "next");
				if (!cursor) break;
				const mutation = cursor.value;
				if (mutation.nextAttemptAt && mutation.nextAttemptAt > Date.now()) break;
				const table = this.tables.get(mutation.entitySetName);
				if (!table) {
					console.error(`Table ${mutation.entitySetName} not registered in DB`);
					await db.delete(this.MUTATION_QUEUE_NAME, mutation.id);
					continue;
				}
				try {
					if (mutation.type === "insert") await table.createRecord(mutation.value);
					else if (mutation.type === "update") await table.updateRecord(mutation.key, mutation.value, { ifMatch: mutation.ifMatch });
					else if (mutation.type === "delete") await table.deleteRecord(mutation.key, { ifMatch: mutation.ifMatch });
					await db.delete(this.MUTATION_QUEUE_NAME, mutation.id);
				} catch (e) {
					if (!navigator.onLine) break;
					console.error(`[dataverse-offline] Failed to flush mutation ${mutation.id}:`, e);
					mutation.error = e;
					mutation.attempts++;
					mutation.lastAttemptAt = Date.now();
					if (mutation.attempts >= MAX_MUTATION_ATTEMPTS) {
						mutation.nextAttemptAt = void 0;
						await db.delete(this.MUTATION_QUEUE_NAME, mutation.id);
						await db.put(this.ERRORED_MUTATIONS_NAME, mutation);
					} else {
						const delay = Math.min(RETRY_MAX_DELAY, RETRY_BASE_DELAY * 2 ** (mutation.attempts - 1));
						mutation.nextAttemptAt = mutation.lastAttemptAt + delay;
						await db.put(this.MUTATION_QUEUE_NAME, mutation);
						break;
					}
				}
			}
		});
	}
	async getQueueCount() {
		return (await this.getDB()).count(this.MUTATION_QUEUE_NAME);
	}
	async getErroredMutations() {
		return (await this.getDB()).getAll(this.ERRORED_MUTATIONS_NAME);
	}
	async retryErroredMutation(id) {
		const tx = (await this.getDB()).transaction([this.MUTATION_QUEUE_NAME, this.ERRORED_MUTATIONS_NAME], "readwrite");
		const mutation = await tx.objectStore(this.ERRORED_MUTATIONS_NAME).get(id);
		if (mutation) {
			mutation.attempts = 0;
			mutation.error = void 0;
			mutation.lastAttemptAt = void 0;
			mutation.nextAttemptAt = void 0;
			await tx.objectStore(this.ERRORED_MUTATIONS_NAME).delete(id);
			await tx.objectStore(this.MUTATION_QUEUE_NAME).put(mutation);
		}
		await tx.done;
		if (mutation && navigator.onLine) await this.flushQueue();
	}
	async discardErroredMutation(id) {
		await (await this.getDB()).delete(this.ERRORED_MUTATIONS_NAME, id);
	}
	async queueMutations(mutations) {
		if (mutations.length === 0) return;
		try {
			const db = await this.getDB();
			const storeNames = [this.MUTATION_QUEUE_NAME, ...new Set(mutations.map((mutation) => mutation.entitySetName))];
			const tx = db.transaction(storeNames, "readwrite");
			for (const mutation of mutations) {
				if (mutation.type === "insert" || mutation.type === "update") tx.objectStore(mutation.entitySetName).put(mutation.value);
				else if (mutation.type === "delete") tx.objectStore(mutation.entitySetName).delete(mutation.key);
				tx.objectStore(this.MUTATION_QUEUE_NAME).put(mutation);
			}
			await tx.done;
		} catch (e) {
			console.error("[dataverse-offline] Error writing mutation to IDB:", e);
			throw new MutationPersistenceError("Failed to persist offline mutations", mutations.map((mutation) => mutation.id), e);
		}
	}
	createCollectionOptions(config) {
		if (this.closed) throw new Error("DataverseSyncDB is closed");
		const { table, syncInterval = DEFAULT_POLL_INTERVAL, readOnlyWhenOffline = false, ...rest } = config;
		this.tables.set(table.entitySetName, table);
		const pk = table.primaryKey;
		const getKey = (item) => item[pk.key];
		const collectionId = table.entitySetName;
		let pollTimer;
		let syncFromDataverse;
		let syncController;
		let activeSync;
		let syncQueued = false;
		let disposed = false;
		const runSync = async () => {
			if (disposed) return;
			if (activeSync) {
				syncQueued = true;
				return activeSync;
			}
			syncController = new AbortController();
			this.activeFetchControllers.add(syncController);
			activeSync = syncFromDataverse(syncController.signal).finally(() => {
				this.activeFetchControllers.delete(syncController);
				syncController = void 0;
				activeSync = void 0;
			});
			await activeSync;
			if (syncQueued && !disposed) {
				syncQueued = false;
				await runSync();
			}
		};
		const scheduleNextSync = (time) => {
			return new Promise((resolve) => {
				if (pollTimer) clearTimeout(pollTimer);
				pollTimer = setTimeout(async () => {
					if (navigator.onLine && document.visibilityState === "visible") {
						await runSync();
						scheduleNextSync(syncInterval);
					}
					resolve();
				}, time);
			});
		};
		const flushAndSync = async () => {
			if (!disposed && document.visibilityState === "visible" && navigator.onLine) {
				await this.flushQueue();
				await scheduleNextSync(50);
			}
		};
		const syncConfig = {
			sync: ({ begin, write, commit, markReady, collection }) => {
				syncFromDataverse = async (signal) => {
					try {
						const records = await table.getRecords(void 0, { signal });
						if (signal.aborted) return;
						const keysToDelete = /* @__PURE__ */ new Set([...collection.keys()]);
						begin();
						for (const record of records) {
							const key = table.getPrimaryId(record);
							const existingRecord = collection.get(key);
							if (existingRecord) {
								if (getEtag(record) !== getEtag(existingRecord)) write({
									type: "update",
									value: record,
									metadata: { source: "dv" }
								});
								keysToDelete.delete(key);
							} else write({
								type: "insert",
								value: record,
								metadata: { source: "dv" }
							});
						}
						for (const key of keysToDelete) write({
							type: "delete",
							value: collection.get(key),
							metadata: { source: "dv" }
						});
						commit();
						const tx = (await this.getDB()).transaction(table.entitySetName, "readwrite");
						await tx.store.clear();
						for (const record of records) tx.store.put(record);
						await tx.done;
					} catch (err) {
						if (err?.name !== "AbortError" && !signal.aborted) console.warn(`[dataverse-offline] Remote sync failed for "${collectionId}":`, err);
					} finally {
						markReady();
					}
				};
				const handleTabMessage = (event) => {
					if (event.data?.type === "MUTATIONS_ADDED") {
						begin();
						for (const mutation of event.data.mutations) if (table.entitySetName === mutation.entitySetName) write({
							type: mutation.type,
							value: mutation.value,
							metadata: { source: "tab" }
						});
						commit();
						scheduleNextSync(50);
					}
				};
				this.channel.addEventListener("message", handleTabMessage);
				const syncFromIDB = async () => {
					const cached = await (await this.getDB()).getAll(table.entitySetName);
					if (!disposed && cached.length > 0) {
						begin();
						for (const item of cached) write({
							type: "insert",
							value: item,
							metadata: { source: "idb" }
						});
						commit();
					}
				};
				syncFromIDB().then(flushAndSync).catch((err) => {
					if (!disposed) console.warn(`[dataverse-offline] Cache sync failed for "${collectionId}":`, err);
				});
				window.addEventListener("online", flushAndSync);
				document.addEventListener("visibilitychange", flushAndSync);
				const cleanup = () => {
					if (disposed) return;
					disposed = true;
					syncQueued = false;
					syncController?.abort("Collection disposed");
					this.channel.removeEventListener("message", handleTabMessage);
					if (pollTimer) clearTimeout(pollTimer);
					window.removeEventListener("online", flushAndSync);
					document.removeEventListener("visibilitychange", flushAndSync);
					this.collectionCleanups.delete(cleanup);
				};
				this.collectionCleanups.add(cleanup);
				return cleanup;
			},
			rowUpdateMode: "full"
		};
		const defaultMutation = async ({ transaction }) => {
			if (readOnlyWhenOffline && !navigator.onLine) throw new Error("Collection is read-only while offline");
			this.abortActiveFetches();
			this.channel.postMessage({ type: "ABORT_ACTIVE_FETCHES" });
			const serialized = transaction.mutations.map((v) => this.serializeMutation(v));
			await this.queueMutations(serialized);
			this.channel.postMessage({
				type: "MUTATIONS_ADDED",
				mutations: serialized
			});
			if (navigator.onLine) {
				await this.flushQueue();
				await scheduleNextSync(100);
			}
		};
		return {
			...rest,
			id: collectionId,
			getKey,
			sync: syncConfig,
			onInsert: defaultMutation,
			onUpdate: defaultMutation,
			onDelete: defaultMutation
		};
	}
};

//#endregion
export { DataverseSyncDB, MutationPersistenceError, dataverseCollectionOptions };