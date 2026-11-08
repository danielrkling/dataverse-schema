import type { FieldBase } from "./fields";
import type { StorageRetryPolicy } from "./retry";
import { MANIFEST_FILE, assertSafeSegment, parseJsonText, readTextFile, writeTextFile } from "./storage";
import {
  FileSystemSingleFileTable,
  FileSystemTable,
  type FileSystemSingleFileTableOptions,
  type FileSystemTableOptions,
} from "./table";
import type {
  FileSystemManifest,
  FsDirectoryHandle,
  ReadOptions,
} from "./types";

export type FileSystemDatabaseOptions = {
  /** Expected schema/storage version — must match the root manifest. */
  version: string | number;
  /** Expected app/brand id — must match the root manifest. */
  brandId: string;
  /** Override the manifest file name. Default `"fsdb.json"`. */
  manifestFile?: string;
  /** Opt-in retry policy for manifest reads/writes. */
  retry?: StorageRetryPolicy;
  signal?: AbortSignal;
};

export type InitializeOptions = {
  /** Replace an existing manifest with a different version/brand. */
  overwrite?: boolean;
  /** Override the manifest file name. Default `"fsdb.json"`. */
  manifestFile?: string;
  /** Opt-in retry policy for manifest reads/writes. */
  retry?: StorageRetryPolicy;
  signal?: AbortSignal;
};

export type ManifestErrorCode = "missing" | "invalid" | "version" | "brand";

/** Thrown when the selected root folder is missing or belongs to another app/version. */
export class FileSystemManifestError extends Error {
  constructor(
    message: string,
    readonly code: ManifestErrorCode,
    readonly manifest?: FileSystemManifest,
  ) {
    super(message);
    this.name = "FileSystemManifestError";
  }
}

function assertRootDirectory(root: FsDirectoryHandle): void {
  if (!root || root.kind !== "directory") {
    throw new Error("A FileSystemDirectoryHandle for the database root is required");
  }
}

function assertManifestShape(value: unknown, fileName: string, rootName: string): FileSystemManifest {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new FileSystemManifestError(
      `Manifest "${fileName}" in root folder "${rootName}" must be a JSON object with "version" and "brandId"`,
      "invalid",
    );
  }
  const object = value as Record<string, unknown>;
  const version = object.version;
  const brandId = object.brandId;
  if (typeof version !== "string" && (typeof version !== "number" || !Number.isFinite(version))) {
    throw new FileSystemManifestError(
      `Manifest "${fileName}" in root folder "${rootName}" is missing a string/number "version"`,
      "invalid",
    );
  }
  if (typeof brandId !== "string" || brandId.length === 0) {
    throw new FileSystemManifestError(
      `Manifest "${fileName}" in root folder "${rootName}" is missing a non-empty string "brandId"`,
      "invalid",
    );
  }
  return { version, brandId };
}

async function readManifest(
  root: FsDirectoryHandle,
  fileName: string,
  options: ReadOptions = {},
  retry?: StorageRetryPolicy,
): Promise<FileSystemManifest | null> {
  const text = await readTextFile(root, fileName, options, {
    operation: "read-manifest",
    path: fileName,
    root: root.name,
    retry,
  });
  if (text === null) return null;
  try {
    return assertManifestShape(parseJsonText(text, `manifest "${fileName}"`), fileName, root.name);
  } catch (error) {
    if (error instanceof FileSystemManifestError) throw error;
    const detail = error instanceof Error ? error.message : String(error);
    throw new FileSystemManifestError(
      `Manifest "${fileName}" in root folder "${root.name}" is invalid: ${detail}`,
      "invalid",
    );
  }
}

function manifestsEqual(a: FileSystemManifest, b: FileSystemManifest): boolean {
  return String(a.version) === String(b.version) && a.brandId === b.brandId;
}

function assertConsistent(
  actual: FileSystemManifest,
  expected: FileSystemManifest,
  rootName: string,
  fileName: string,
): void {
  if (String(actual.version) !== String(expected.version)) {
    throw new FileSystemManifestError(
      `Root folder "${rootName}" version mismatch: manifest "${fileName}" has version "${actual.version}" (brandId "${actual.brandId}"), expected version "${expected.version}" (brandId "${expected.brandId}")`,
      "version",
      actual,
    );
  }
  if (actual.brandId !== expected.brandId) {
    throw new FileSystemManifestError(
      `Root folder "${rootName}" brand mismatch: manifest "${fileName}" has brandId "${actual.brandId}" (version "${actual.version}"), expected brandId "${expected.brandId}" (version "${expected.version}")`,
      "brand",
      actual,
    );
  }
}

/**
 * A selected root folder containing an `fsdb.json` manifest:
 *
 * ```json
 * { "version": 1, "brandId": "com.acme.app" }
 * ```
 *
 * Opening the root verifies the manifest against the expected version/brand and
 * throws a {@link FileSystemManifestError} when it is missing, invalid, or
 * inconsistent. Table folders/files then live under this root.
 */
export class FileSystemDatabase {
  readonly manifestFile: string;
  readonly manifest: FileSystemManifest;
  readonly retry: StorageRetryPolicy | undefined;

  private constructor(
    readonly root: FsDirectoryHandle,
    manifest: FileSystemManifest,
    manifestFile: string,
    retry?: StorageRetryPolicy,
  ) {
    this.manifest = manifest;
    this.manifestFile = manifestFile;
    this.retry = retry;
  }

  /**
   * Opens an existing root folder and verifies its manifest. Does not create
   * folders or manifests; use {@link initialize} when provisioning a new root.
   */
  static async open(root: FsDirectoryHandle, options: FileSystemDatabaseOptions): Promise<FileSystemDatabase> {
    assertRootDirectory(root);
    const manifestFile = assertSafeSegment(options.manifestFile ?? MANIFEST_FILE, "manifest file name");
    const expected = assertManifestShape(
      { version: options.version, brandId: options.brandId },
      manifestFile,
      root.name,
    );
    const stored = await readManifest(root, manifestFile, { signal: options.signal }, options.retry);
    if (stored === null) {
      throw new FileSystemManifestError(
        `Root folder "${root.name}" has no "${manifestFile}" manifest — run FileSystemDatabase.initialize(root, { version, brandId }) first`,
        "missing",
      );
    }
    assertConsistent(stored, expected, root.name, manifestFile);
    return new FileSystemDatabase(root, stored, manifestFile, options.retry);
  }

  /**
   * Creates (or, with `overwrite`, replaces) the root manifest. Re-running with
   * the same version/brand is idempotent; a different existing manifest throws
   * unless `overwrite: true`.
   */
  static async initialize(
    root: FsDirectoryHandle,
    manifest: FileSystemManifest,
    options: InitializeOptions = {},
  ): Promise<FileSystemDatabase> {
    assertRootDirectory(root);
    const expected = assertManifestShape(manifest, options.manifestFile ?? MANIFEST_FILE, root.name);
    const manifestFile = assertSafeSegment(options.manifestFile ?? MANIFEST_FILE, "manifest file name");
    if (!options.overwrite) {
      const stored = await readManifest(
        root,
        manifestFile,
        { signal: options.signal },
        options.retry,
      );
      if (stored !== null) {
        if (manifestsEqual(stored, expected)) {
          return new FileSystemDatabase(root, stored, manifestFile, options.retry);
        }
        // Throws a code-specific consistency error.
        assertConsistent(stored, expected, root.name, manifestFile);
      }
    }
    const serialized = `${JSON.stringify(expected, null, 2)}\n`;
    await writeTextFile(root, manifestFile, serialized, { signal: options.signal }, {
      operation: "write-manifest",
      path: manifestFile,
      root: root.name,
      retry: options.retry,
    });
    return new FileSystemDatabase(root, expected, manifestFile, options.retry);
  }

  /** Re-reads the manifest and verifies it against this database's expectations. */
  async verify(options: ReadOptions = {}): Promise<FileSystemManifest> {
    const stored = await readManifest(this.root, this.manifestFile, options, this.retry);
    if (stored === null) {
      throw new FileSystemManifestError(
        `Root folder "${this.root.name}" no longer has a "${this.manifestFile}" manifest`,
        "missing",
      );
    }
    assertConsistent(stored, this.manifest, this.root.name, this.manifestFile);
    return stored;
  }

  /**
   * Creates a folder-backed table: one directory per table, one `<id>.json`
   * file per record.
   */
  table<TFields extends Record<string, FieldBase<any>>>(
    options: Omit<FileSystemTableOptions<TFields>, "db">,
  ): FileSystemTable<TFields> {
    return new FileSystemTable({ ...options, db: this });
  }

  /**
   * Creates a single-file table: every record lives in one JSON array file at
   * the root of the database.
   */
  singleFileTable<TFields extends Record<string, FieldBase<any>>>(
    options: Omit<FileSystemSingleFileTableOptions<TFields>, "db">,
  ): FileSystemSingleFileTable<TFields> {
    return new FileSystemSingleFileTable({ ...options, db: this });
  }
}

/** Options understood by the browser's `showDirectoryPicker`. */
export type DirectoryPickerOptions = {
  id?: string;
  mode?: "read" | "readwrite";
  startIn?: unknown;
};

type PickerGlobal = typeof globalThis & {
  showDirectoryPicker?: (options?: DirectoryPickerOptions) => Promise<FsDirectoryHandle>;
};

/**
 * Opens the browser folder picker. Requires a secure context and a browser that
 * implements the File System Access API.
 */
export async function pickRoot(options: DirectoryPickerOptions = {}): Promise<FsDirectoryHandle> {
  const picker = (globalThis as PickerGlobal).showDirectoryPicker;
  if (typeof picker !== "function") {
    throw new Error(
      "The File System Access API is not available — use a Chromium-based browser in a secure context, or pass a FileSystemDirectoryHandle obtained elsewhere",
    );
  }
  return picker.call(globalThis, { mode: "readwrite", ...options });
}

/**
 * Checks (and optionally requests) read/write permission on a handle. Returns
 * `true` when the browser has no permission surface to query (e.g. a handle
 * supplied by a test or an embedding environment).
 */
export async function ensurePermission(
  handle: FsDirectoryHandle,
  mode: "read" | "readwrite" = "readwrite",
  options: { request?: boolean } = {},
): Promise<boolean> {
  const permissionHandle = handle as FsDirectoryHandle & {
    queryPermission?: (descriptor: { mode: "read" | "readwrite" }) => Promise<PermissionState>;
    requestPermission?: (descriptor: { mode: "read" | "readwrite" }) => Promise<PermissionState>;
  };
  if (typeof permissionHandle.queryPermission !== "function") return true;
  const descriptor = { mode };
  try {
    if ((await permissionHandle.queryPermission(descriptor)) === "granted") return true;
    if (options.request === false || typeof permissionHandle.requestPermission !== "function") {
      return false;
    }
    return (await permissionHandle.requestPermission(descriptor)) === "granted";
  } catch {
    // Permission requests require a user gesture in most browsers; treat a
    // rejected prompt as "not currently permitted" and let the caller decide.
    return false;
  }
}
