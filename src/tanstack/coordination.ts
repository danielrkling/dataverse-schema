const CHANNEL_NAME = "dataverse-offline";

/**
 * Fails loudly when the cross-tab coordination APIs required by offline sync
 * are unavailable. Both are shipped in all evergreen browsers since 2020-2022.
 */
export function requireCrossTabApis(): void {
  if (typeof navigator === "undefined" || !("locks" in navigator)) {
    throw new Error(
      "dataverseOfflineCollectionOptions requires the Web Locks API (navigator.locks), available in all evergreen browsers since 2020-2022",
    );
  }
  if (typeof BroadcastChannel === "undefined") {
    throw new Error(
      "dataverseOfflineCollectionOptions requires the BroadcastChannel API, available in all evergreen browsers since 2020",
    );
  }
}

/**
 * Runs `fn` while holding a named lock. Returns `null` when another tab holds
 * the lock (non-leader tabs skip the locked section). Web Locks releases the
 * lock automatically if the tab is killed mid-callback, so interruptions can
 * never leave the lock held.
 */
export async function withLock<T>(
  name: string,
  fn: () => Promise<T>,
): Promise<T | null> {
  const locks = (navigator as any).locks;
  if (!locks) return null;
  return (await locks.request(
    name,
    { ifAvailable: true },
    async (lock: any) => {
      if (!lock) return null;
      return fn();
    },
  )) as T | null;
}

export function replayLockName(dbName: string, collectionId: string): string {
  return `dataverse-offline:${dbName}:${collectionId}`;
}

export type OfflineChannelMessage = {
  type: "sync-complete" | "queue-changed";
  dbName: string;
  collectionId: string;
  count?: number;
  /** Optional sender instance id — used to ignore self-delivered messages. */
  source?: string;
};

export type OfflineChannelHandler = (message: OfflineChannelMessage) => void;

/**
 * Subscribes to cross-tab offline events. Returns a cleanup function that
 * closes the channel. Messages are not self-filtered; handlers must ignore
 * events for other databases/collections.
 */
export function openChannel(handler: OfflineChannelHandler): () => void {
  const channel = new BroadcastChannel(CHANNEL_NAME);
  channel.onmessage = (event: MessageEvent) => {
    const message = event.data as OfflineChannelMessage;
    if (!message) return;
    handler(message);
  };
  return () => channel.close();
}

let postChannel: BroadcastChannel | null | undefined;

function getPostChannel(): BroadcastChannel | null {
  if (postChannel === undefined) {
    try {
      postChannel = new BroadcastChannel(CHANNEL_NAME);
    } catch {
      postChannel = null;
    }
  }
  return postChannel;
}

export function postToChannel(message: OfflineChannelMessage): void {
  try {
    getPostChannel()?.postMessage(message);
  } catch {
    // Best effort — the channel may be closed or unavailable
  }
}
