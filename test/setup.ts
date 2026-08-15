import "fake-indexeddb/auto";
import { beforeAll, afterEach, afterAll } from "vitest"
import { server } from "./mocks/server"

// jsdom doesn't implement BroadcastChannel or navigator.locks. Offline sync
// fails loudly without them, so provide in-process shims before any test
// imports the offline collection. The shims share state across the whole test
// process, which lets tests simulate multiple tabs.

if (typeof globalThis.BroadcastChannel === "undefined") {
  type MockMessageEvent = { data: any }
  type MockHandler = (event: MockMessageEvent) => void

  class MockBroadcastChannel {
    private static registry = new Map<string, Set<MockBroadcastChannel>>()
    onmessage: MockHandler | null = null
    private closed = false

    constructor(private name: string) {
      const set = MockBroadcastChannel.registry.get(name) ?? new Set<MockBroadcastChannel>()
      set.add(this)
      MockBroadcastChannel.registry.set(name, set)
    }

    postMessage(data: any): void {
      if (this.closed) return
      const set = MockBroadcastChannel.registry.get(this.name)
      if (!set) return
      for (const channel of set) {
        if (channel !== this && !channel.closed && channel.onmessage) {
          channel.onmessage({ data })
        }
      }
    }

    close(): void {
      this.closed = true
      MockBroadcastChannel.registry.get(this.name)?.delete(this)
    }
  }

  globalThis.BroadcastChannel = MockBroadcastChannel as unknown as typeof BroadcastChannel
}

if (typeof navigator !== "undefined" && !("locks" in navigator)) {
  type LockCallback = (lock: { name: string; mode: string } | null) => any

  class LockManagerMock {
    private held = new Set<string>()
    private tails = new Map<string, Promise<void>>()

    request(
      name: string,
      options: { ifAvailable?: boolean } | LockCallback,
      maybeCallback?: LockCallback,
    ): Promise<any> {
      const callback = typeof options === "function" ? options : maybeCallback!
      const ifAvailable = typeof options === "object" ? options.ifAvailable === true : false

      const run = async (): Promise<any> => {
        if (this.held.has(name)) {
          if (ifAvailable) return null
          await (this.tails.get(name) ?? Promise.resolve())
          return run()
        }
        this.held.add(name)
        try {
          return await callback({ name, mode: "exclusive" })
        } finally {
          this.held.delete(name)
        }
      }

      const promise = run()
      const prev = this.tails.get(name) ?? Promise.resolve()
      this.tails.set(
        name,
        prev.then(() => promise, () => promise).then(() => undefined, () => undefined),
      )
      return promise
    }
  }

  Object.defineProperty(navigator, "locks", {
    value: new LockManagerMock(),
    configurable: true,
    writable: true,
  })
}

beforeAll(() => server.listen({ onUnhandledRequest: "bypass" }))
afterEach(() => server.resetHandlers())
afterAll(() => server.close())
