import { SyncEngine, type QueuedMutation } from "../../../src/tanstack-db"

/**
 * Builds a SyncEngine with a per-run-unique name so multiple harness
 * invocations never collide on the same IndexedDB database or BroadcastChannel.
 * Every engine is registered with {@link createdEngines} so the run-level
 * sweep can close anything a suite forgot to close before purging databases.
 */
const createdEngines = new Set<SyncEngine>()
export function makeSyncDB(tables: any[], version = 1): SyncEngine {
  const name = `dvt-db-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
  const db = new SyncEngine({ name, tables, version })
  createdEngines.add(db)
  return db
}

/**
 * Closes every engine created by makeSyncDB in this page (guards against a
 * suite finally-block that forgot db.close()), so database deletion is not
 * blocked by an open connection.
 */
export function closeAllEngines(): number {
  let closed = 0
  for (const db of [...createdEngines]) {
    try { db.close(); closed++ } catch { /* already closed */ }
  }
  return closed
}

/** Reads the raw mutation queue straight from IndexedDB (durability assertions). */
export async function readQueue(db: SyncEngine): Promise<QueuedMutation[]> {
  const idb = await (db as any).getDB()
  return (await idb.getAll(db.MUTATION_QUEUE_NAME)) as QueuedMutation[]
}

/** Reads the errored-mutation store straight from IndexedDB. */
export async function readErrored(db: SyncEngine): Promise<QueuedMutation[]> {
  const idb = await (db as any).getDB()
  return (await idb.getAll(db.ERRORED_MUTATIONS_NAME)) as QueuedMutation[]
}

/** Directly enqueue a mutation (test-only path to exercise the queue/retry plumbing). */
export async function enqueueRaw(db: SyncEngine, mutation: QueuedMutation): Promise<void> {
  await (db as any).queueMutations([mutation])
}

/** Force a single flush attempt (test-only). */
export async function flush(db: SyncEngine): Promise<void> {
  await (db as any).flushQueue().catch(() => undefined)
}

/**
 * Offline simulation. The adapter reads `navigator.onLine` live, so overriding
 * it (plus dispatching the matching event) is enough to flip its behaviour.
 * Returns a restore function.
 */
export function simulateOffline(offline: boolean): () => void {
  const previous = navigator.onLine
  Object.defineProperty(navigator, "onLine", {
    configurable: true,
    get: () => !offline,
  })
  window.dispatchEvent(new Event(offline ? "offline" : "online"))
  return () => {
    Object.defineProperty(navigator, "onLine", {
      configurable: true,
      get: () => previous,
    })
    window.dispatchEvent(new Event(previous ? "online" : "offline"))
  }
}

/**
 * The adapter gates all remote syncing/flushing on
 * `document.visibilityState === "visible"`. A Dataverse web resource often
 * reports "hidden", which would silently disable flushing. Force "visible" for
 * the duration of a test. Returns a restore function.
 */
export function forceVisible(): () => void {
  const previous = document.visibilityState
  Object.defineProperty(document, "visibilityState", {
    configurable: true,
    get: () => "visible",
  })
  return () => {
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      get: () => previous,
    })
  }
}

/** Polls `predicate` (may be async) until true or `timeoutMs` elapses. */
export async function waitFor(
  predicate: () => boolean | Promise<boolean>,
  timeoutMs = 5000,
  intervalMs = 100,
): Promise<void> {
  const start = Date.now()
  while (!(await predicate())) {
    if (Date.now() - start > timeoutMs) {
      throw new Error(`waitFor timed out after ${timeoutMs}ms`)
    }
    await new Promise((r) => setTimeout(r, intervalMs))
  }
}

/**
 * Lists the harness-created IndexedDB databases created by earlier runs.
 * Engines use a `dvt-db-*` name prefix (see makeSyncDB), so every database
 * matching that stem is sweppable test residue.
 */
export async function dvtDbNames(): Promise<string[]> {
  const anyIdb = indexedDB as unknown as {
    databases?: () => Promise<Array<{ name?: string }> | undefined>
  }
  if (typeof anyIdb.databases !== "function") return []
  const dbs = (await anyIdb.databases()) ?? []
  return dbs.map((d) => d.name!).filter((n) => !!n && n.startsWith("dvt-db-"))
}

/** Deletes the given databases, resolving on any outcome (best-effort sweep). */
export async function deleteDatabases(names: string[]): Promise<void> {
  // Deletions can be temporarily blocked by a just-closing connection or a
  // pending transaction — retry a few times with delay before giving up.
  const pending = new Set(names)
  for (let attempt = 0; attempt < 4 && pending.size > 0; attempt++) {
    if (attempt > 0) await new Promise((r) => setTimeout(r, 150))
    const batch = [...pending]
    await Promise.all(
      batch.map(
        (name) =>
          new Promise<void>((resolve) => {
            const request = indexedDB.deleteDatabase(name)
            const done = (fail?: unknown) => {
              fail ? console.warn(`[harness] db sweep blocked/failed for "${name}"`, fail) : pending.delete(name)
              resolve()
            }
            request.onsuccess = () => { pending.delete(name); resolve() }
            request.onerror = () => done(request.error)
            request.onblocked = () => done(new Error("blocked"))
          }),
      ),
    )
  }
}

/**
 * Removes every `dvt-db-*` IndexedDB database (the SyncEngine queue/errored/
 * per-collection cache stores) left over from this or earlier runs. Safe to
 * call before or after a run; each suite closes its engines, so sweeps are
 * only blocked by a genuinely leaked connection, which the next sweep retries.
 */
export async function sweepTestDbs(): Promise<number> {
  const names = await dvtDbNames()
  if (names.length === 0) return 0
  await deleteDatabases(names)
  return names.length
}
