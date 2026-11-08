import { expect, test, vi } from "vitest";
import {
  FileSystemDatabase,
  isFileSystemObserverSupported,
  primaryKey,
  text,
} from "../src";
import { createMemoryRoot } from "./memory-fs";

type Callback = (records: any[]) => void;

class FakeFileSystemObserver {
  static instances: FakeFileSystemObserver[] = [];

  readonly callback: Callback;
  observedHandle: any;
  observedOptions: any;
  disconnected = false;

  constructor(callback: Callback) {
    this.callback = callback;
    FakeFileSystemObserver.instances.push(this);
  }

  async observe(handle: any, options?: any) {
    this.observedHandle = handle;
    this.observedOptions = options;
  }

  disconnect() {
    this.disconnected = true;
  }

  emit(records: any[]) {
    this.callback(records);
  }
}

async function withObserver<T>(run: () => Promise<T>): Promise<T> {
  const globalObject = globalThis as any;
  const original = globalObject.FileSystemObserver;
  FakeFileSystemObserver.instances = [];
  globalObject.FileSystemObserver = FakeFileSystemObserver;
  try {
    return await run();
  } finally {
    globalObject.FileSystemObserver = original;
    FakeFileSystemObserver.instances = [];
  }
}

async function makeTasks() {
  const root = createMemoryRoot("acme-db");
  const db = await FileSystemDatabase.initialize(root, { version: 1, brandId: "acme" });
  const Tasks = db.table({
    name: "tasks",
    fields: { id: primaryKey(), title: text("title") },
  });
  await Tasks.createRecord({ id: "1", title: "A" });
  return { root, db, Tasks };
}

test("the support check sees a Chromium-style FileSystemObserver", async () => {
  await withObserver(async () => {
    expect(isFileSystemObserverSupported()).toBe(true);
  });
  expect(isFileSystemObserverSupported()).toBe(false);
});

test("folder table watch emits created/updated/deleted record events", async () => {
  await withObserver(async () => {
    const { Tasks } = await makeTasks();
    const events: any[] = [];
    const stop = await Tasks.watch((event) => {
      events.push(event);
    });
    const observer = FakeFileSystemObserver.instances.at(-1)!;

    observer.emit([
      {
        changedHandle: { kind: "file", name: "1.json" },
        relativePathComponents: ["1.json"],
        type: "modified",
      },
    ]);
    await vi.waitFor(() => expect(events).toHaveLength(1));
    expect(events[0]).toMatchObject({ type: "updated", id: "1", fileName: "1.json" });
    expect(events[0].record).toMatchObject({ id: "1", title: "A" });

    observer.emit([
      {
        changedHandle: { kind: "file", name: "2.json" },
        relativePathComponents: ["2.json"],
        type: "appeared",
      },
    ]);
    await vi.waitFor(() => expect(events).toHaveLength(2));
    // The file does not exist yet, so the reader treats it as vanished.
    expect(events[1]).toMatchObject({ type: "created", id: "2" });
    expect(events[1].record).toBeUndefined();

    observer.emit([
      {
        changedHandle: { kind: "file", name: "1.json" },
        relativePathComponents: ["1.json"],
        type: "disappeared",
      },
    ]);
    await vi.waitFor(() => expect(events).toHaveLength(3));
    expect(events[2]).toMatchObject({ type: "deleted", id: "1", fileName: "1.json" });
    expect(events[2]).not.toHaveProperty("record");

    stop();
    expect(observer.disconnected).toBe(true);
  });
});

test("folder watch ignores nested/internal paths", async () => {
  await withObserver(async () => {
    const { Tasks } = await makeTasks();
    const events: any[] = [];
    await Tasks.watch((event) => {
      events.push(event);
    });
    const observer = FakeFileSystemObserver.instances.at(-1)!;

    observer.emit([
      {
        changedHandle: { kind: "file", name: "1.json" },
        relativePathComponents: ["nested", "1.json"],
        type: "modified",
      },
      {
        changedHandle: { kind: "directory", name: "ignored" },
        relativePathComponents: ["ignored"],
        type: "appeared",
      },
    ]);
    await new Promise((resolve) => setTimeout(resolve, 5));
    expect(events).toEqual([]);
  });
});

test("single-file table watch diffs the array into per-record events", async () => {
  await withObserver(async () => {
    const root = createMemoryRoot("acme-db");
    const db = await FileSystemDatabase.initialize(root, { version: 1, brandId: "acme" });
    const Settings = db.singleFileTable({
      name: "settings",
      fields: { id: primaryKey(), title: text("title") },
    });
    await Settings.createRecord({ id: "a", title: "A" });

    const events: any[] = [];
    const stop = await Settings.watch((event) => {
      events.push(event);
    });
    const observer = FakeFileSystemObserver.instances.at(-1)!;
    const folder = await root.getDirectoryHandle("settings");

    folder.files.set("data.json", JSON.stringify([{ id: "a", title: "A2" }]));
    observer.emit([
      {
        changedHandle: { kind: "file", name: "data.json" },
        relativePathComponents: ["data.json"],
        type: "modified",
      },
    ]);
    await vi.waitFor(() => expect(events).toHaveLength(1));
    expect(events[0]).toMatchObject({ type: "updated", id: "a", fileName: "data.json" });
    expect(events[0].record).toMatchObject({ id: "a", title: "A2" });

    folder.files.set("data.json", JSON.stringify([
      { id: "a", title: "A2" },
      { id: "b", title: "B" },
    ]));
    observer.emit([
      {
        changedHandle: { kind: "file", name: "data.json" },
        relativePathComponents: ["data.json"],
        type: "modified",
      },
    ]);
    await vi.waitFor(() => expect(events).toHaveLength(2));
    expect(events[1]).toMatchObject({ type: "created", id: "b" });

    folder.files.delete("data.json");
    observer.emit([
      {
        changedHandle: { kind: "file", name: "data.json" },
        relativePathComponents: ["data.json"],
        type: "disappeared",
      },
    ]);
    await vi.waitFor(() => expect(events).toHaveLength(4));
    expect(events.slice(2).every((event) => event.type === "deleted")).toBe(true);

    stop();
    expect(observer.disconnected).toBe(true);
  });
});

test("watch disconnects when its signal aborts", async () => {
  await withObserver(async () => {
    const { Tasks } = await makeTasks();
    const controller = new AbortController();
    const stop = await Tasks.watch(() => {}, { signal: controller.signal });
    const observer = FakeFileSystemObserver.instances.at(-1)!;

    controller.abort();
    expect(observer.disconnected).toBe(true);
    stop(); // idempotent
  });
});

test("watch throws clearly when FileSystemObserver is unavailable", async () => {
  const globalObject = globalThis as any;
  const original = globalObject.FileSystemObserver;
  delete globalObject.FileSystemObserver;
  try {
    const { Tasks } = await makeTasks();
    await expect(Tasks.watch(() => {})).rejects.toThrow(/FileSystemObserver is not available/);
  } finally {
    globalObject.FileSystemObserver = original;
  }
});
