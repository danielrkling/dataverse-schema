import { DataverseSyncDB, type QueuedMutation } from "../../../src/tanstack-db/index"

/**
 * Builds a DataverseSyncDB with a per-run-unique name so multiple harness
 * invocations never collide on the same IndexedDB database or BroadcastChannel.
 */
export function makeSyncDB(tables: any[], version = 1): DataverseSyncDB {
  const name = `dvt-db-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
  return new DataverseSyncDB(name, tables, version)
}

/** Reads the raw mutation queue straight from IndexedDB (durability assertions). */
export async function readQueue(db: DataverseSyncDB): Promise<QueuedMutation[]> {
  const idb = await (db as any).getDB()
  return (await idb.getAll(db.MUTATION_QUEUE_NAME)) as QueuedMutation[]
}

/** Reads the errored-mutation store straight from IndexedDB. */
export async function readErrored(db: DataverseSyncDB): Promise<QueuedMutation[]> {
  const idb = await (db as any).getDB()
  return (await idb.getAll(db.ERRORED_MUTATIONS_NAME)) as QueuedMutation[]
}

/** Directly enqueue a mutation (test-only path to exercise the queue/retry plumbing). */
export async function enqueueRaw(db: DataverseSyncDB, mutation: QueuedMutation): Promise<void> {
  await (db as any).queueMutations([mutation])
}

/** Force a single flush attempt (test-only). */
export async function flush(db: DataverseSyncDB): Promise<void> {
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
