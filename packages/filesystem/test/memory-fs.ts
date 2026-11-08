import type { FsDirectoryHandle, FsEntry, FsFileHandle, FsWritable } from "../src/types";

function notFound(name: string): Error {
  const error = new Error(`Entry "${name}" was not found`);
  error.name = "NotFoundError";
  return error;
}

/** Builds a DOMException-shaped error for failure-injection tests. */
export function domError(name: string, message = name): Error {
  const error = new Error(message);
  error.name = name;
  return error;
}

export type MemoryFailures = {
  getFileHandle?: Error;
  getDirectoryHandle?: Error;
  removeEntry?: Error;
  values?: Error;
  createWritable?: Error;
  write?: Error;
  close?: Error;
};

class MemoryWritable implements FsWritable {
  private chunks: string[] = [];

  constructor(
    private readonly directory: MemoryDirectory,
    private readonly fileName: string,
  ) {}

  async write(data: string): Promise<void> {
    const next = this.directory.takeNextFailure("write");
    if (next) throw next;
    if (this.directory.failures.write) throw this.directory.failures.write;
    this.chunks.push(data);
  }

  async close(): Promise<void> {
    const next = this.directory.takeNextFailure("close");
    if (next) throw next;
    if (this.directory.failures.close) throw this.directory.failures.close;
    this.directory.files.set(this.fileName, this.chunks.join(""));
  }

  async abort(): Promise<void> {
    this.chunks = [];
  }
}

class MemoryFile implements FsFileHandle {
  readonly kind = "file" as const;

  constructor(
    private readonly directory: MemoryDirectory,
    readonly name: string,
  ) {}

  async getFile(): Promise<{ text(): Promise<string> }> {
    const content = this.directory.files.get(this.name);
    if (content === undefined) throw notFound(this.name);
    return { text: async () => content };
  }

  async createWritable(): Promise<FsWritable> {
    const next = this.directory.takeNextFailure("createWritable");
    if (next) throw next;
    if (this.directory.failures.createWritable) throw this.directory.failures.createWritable;
    return new MemoryWritable(this.directory, this.name);
  }
}

export class MemoryDirectory implements FsDirectoryHandle {
  readonly kind = "directory" as const;
  readonly files = new Map<string, string>();
  readonly directories = new Map<string, MemoryDirectory>();
  readonly failures: MemoryFailures = {};
  readonly failNext: MemoryFailures = {};

  constructor(readonly name: string) {}

  /** Consumes a one-shot injected failure for retry tests. */
  takeNextFailure(key: keyof MemoryFailures): Error | undefined {
    const error = this.failNext[key];
    if (error) delete this.failNext[key];
    return error;
  }

  async getDirectoryHandle(name: string, options: { create?: boolean } = {}): Promise<MemoryDirectory> {
    const next = this.takeNextFailure("getDirectoryHandle");
    if (next) throw next;
    if (this.failures.getDirectoryHandle) throw this.failures.getDirectoryHandle;
    const existing = this.directories.get(name);
    if (existing) return existing;
    if (!options.create) throw notFound(name);
    const directory = new MemoryDirectory(name);
    this.directories.set(name, directory);
    return directory;
  }

  async getFileHandle(name: string, options: { create?: boolean } = {}): Promise<FsFileHandle> {
    const next = this.takeNextFailure("getFileHandle");
    if (next) throw next;
    if (this.failures.getFileHandle) throw this.failures.getFileHandle;
    const exists = this.files.has(name);
    if (!exists && !options.create) throw notFound(name);
    if (!exists) this.files.set(name, "");
    return new MemoryFile(this, name);
  }

  async removeEntry(name: string): Promise<void> {
    const next = this.takeNextFailure("removeEntry");
    if (next) throw next;
    if (this.failures.removeEntry) throw this.failures.removeEntry;
    if (this.files.delete(name)) return;
    if (this.directories.delete(name)) return;
    throw notFound(name);
  }

  async *values(): AsyncIterableIterator<FsEntry> {
    const next = this.takeNextFailure("values");
    if (next) throw next;
    if (this.failures.values) throw this.failures.values;
    for (const name of this.files.keys()) yield { kind: "file", name };
    for (const name of this.directories.keys()) yield { kind: "directory", name };
  }

  /** Test convenience: parsed file content. */
  json<T = any>(name: string): T {
    const content = this.files.get(name);
    if (content === undefined) throw notFound(name);
    return JSON.parse(content) as T;
  }
}

export function createMemoryRoot(name = "root"): MemoryDirectory {
  return new MemoryDirectory(name);
}

/** Gets (creating as needed) a nested directory for assertions. */
export function directory(root: MemoryDirectory, ...segments: string[]): MemoryDirectory {
  let current = root;
  for (const segment of segments) {
    const next = current.directories.get(segment);
    if (!next) throw notFound(segment);
    current = next;
  }
  return current;
}
