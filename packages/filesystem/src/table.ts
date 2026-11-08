import type { StandardSchemaV1 } from "@standard-schema/spec";
import type { FileSystemDatabase } from "./database";
import { FileSystemConflictError, type FileSystemOperation } from "./errors";
import { FieldBase, validateStandardSync, type InferRecord } from "./fields";
import type { StorageRetryPolicy } from "./retry";
import {
  assertSafeSegment,
  ensureJsonFileName,
  fileExists,
  getSubdirectory,
  listDirectory,
  parseJsonText,
  readTextFile,
  recordFileName,
  recordIdFromFileName,
  recordIdSegment,
  removeFile,
  revisionOfText,
  trySubdirectory,
  uniqueJsonFileName,
  writeTextFile,
  type StorageContext,
} from "./storage";
import type {
  DeleteOptions,
  FsDirectoryHandle,
  HistoryEntry,
  HistoryEntryInfo,
  ReadOptions,
  RecordId,
  RestoreHistoryOptions,
  RestoreRecordOptions,
  TrashEntry,
  TrashEntryInfo,
  WithRevision,
  WriteOptions,
} from "./types";
import { REVISION_KEY } from "./types";
import {
  mapObserverChangeType,
  observeHandle,
  type TableWatchEvent,
  type TableWatchOptions,
} from "./watch";

export type TimestampsOption =
  | boolean
  | {
      /** Field key for the creation timestamp. Default `"createdAt"`. */
      createdAt?: string;
      /** Field key for the update timestamp. Default `"updatedAt"`. */
      updatedAt?: string;
    };

export type HistoryOption =
  | boolean
  | {
      /** Number of snapshots to keep per record; `0` keeps everything. Default `20`. */
      limit?: number;
    };

export type FileSystemTableMetadata = {
  format: "filesystem-schema/table";
  version: string | number;
  kind: "folder" | "single-file";
  brandId: string;
  primaryKey: string;
  trash: boolean;
  history?: { limit: number };
  timestamps?: { createdAt: string; updatedAt: string };
  createdAt: string;
  updatedAt: string;
};

export type FileSystemTableOptions<TFields extends Record<string, FieldBase<any>>> = {
  db: FileSystemDatabase;
  /** Table folder name under the database root. */
  name: string;
  fields: TFields;
  /** Key of the transformed record holding the id. Default `"id"`. */
  primaryKey?: string;
  /** Optional whole-record Standard Schema validation. */
  schema?: StandardSchemaV1;
  /**
   * Override the database's retry policy for this table. `false` disables it.
   * Reads retry by default when a policy is present; writes/deletes only when
   * explicitly enabled in the policy.
   */
  retry?: StorageRetryPolicy | false;
  /**
   * Soft-delete records into `<table>/.meta/trash/` instead of removing them.
   * `deleteRecord(..., { permanent: true })` bypasses it.
   */
  trash?: boolean;
  /**
   * Maintain creation/update timestamps. The named fields must be declared in
   * `fields` (use `datetime()` for real `Date` values).
   */
  timestamps?: TimestampsOption;
  /**
   * Keep prior record snapshots in `<table>/.meta/history/<id>/`. Snapshot
   * writes happen before updates and permanent deletes.
   */
  history?: HistoryOption;
  /**
   * Version written to `<table>/.meta/table.json`. Defaults to the root
   * manifest version.
   */
  schemaVersion?: string | number;
};

export type FileSystemSingleFileTableOptions<
  TFields extends Record<string, FieldBase<any>>,
> = Omit<FileSystemTableOptions<TFields>, "name"> & {
  /** Logical table name / folder name. */
  name: string;
  /** Data file name inside the table folder. Defaults to `data.json`. */
  fileName?: string;
};

type AnyRecord = Record<string, unknown>;

type ManagedTimestamps = { createdAt: string; updatedAt: string };
type HistoryConfig = { limit: number };
type HistoryFile = { savedAt: string; data: unknown };

function serializeJson(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function withoutUndefined(value: AnyRecord): AnyRecord {
  const out: AnyRecord = {};
  for (const [key, entry] of Object.entries(value)) {
    if (entry !== undefined) out[key] = entry;
  }
  return out;
}

function isRecord(value: unknown): value is AnyRecord {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function parseHistoryFile(text: string, label: string): HistoryFile {
  const parsed = parseJsonText(text, label);
  if (!isRecord(parsed) || typeof parsed.savedAt !== "string") {
    throw new Error(`${label} is not a valid history entry (expected { savedAt, data })`);
  }
  return { savedAt: parsed.savedAt, data: parsed.data };
}

function parseTrashEntry(text: string, label: string): TrashEntry {
  const parsed = parseJsonText(text, label);
  if (
    !isRecord(parsed) ||
    (typeof parsed.id !== "string" && typeof parsed.id !== "number") ||
    typeof parsed.deletedAt !== "string"
  ) {
    throw new Error(`${label} is not a valid trash entry (expected { id, deletedAt, data })`);
  }
  return { id: String(parsed.id), deletedAt: parsed.deletedAt, data: parsed.data };
}

/**
 * Shared schema/transform layer for both storage layouts. Handles field name
 * mapping, Date/JSON conversion, per-field validation, primary-key assignment,
 * revisions, trash/history storage, and whole-record validation.
 */
export abstract class FileSystemTableBase<
  TFields extends Record<string, FieldBase<any>>,
> {
  readonly db: FileSystemDatabase;
  readonly name: string;
  readonly fields: TFields;
  readonly primaryKey: { key: string };
  readonly schema: StandardSchemaV1 | undefined;
  readonly retry: StorageRetryPolicy | undefined;
  readonly trashEnabled: boolean;
  readonly timestampFields: ManagedTimestamps | undefined;
  readonly history: HistoryConfig | undefined;
  readonly schemaVersion: string | number;

  abstract readonly layout: "folder" | "single-file";

  /** No runtime value. Use for type inference: `InferTable<typeof Tasks>`. */
  T!: InferRecord<TFields>;

  private _metadataPromise: Promise<FileSystemTableMetadata> | undefined;

  protected constructor(options: FileSystemTableOptions<TFields>) {
    this.db = options.db;
    this.name = options.name;
    this.fields = options.fields;
    this.primaryKey = { key: options.primaryKey ?? "id" };
    this.schema = options.schema;
    this.retry = options.retry === false ? undefined : (options.retry ?? options.db.retry);
    this.trashEnabled = options.trash === true;
    this.schemaVersion = options.schemaVersion ?? options.db.manifest.version;

    if (options.timestamps) {
      const config = options.timestamps === true ? {} : options.timestamps;
      const createdAt = config.createdAt ?? "createdAt";
      const updatedAt = config.updatedAt ?? "updatedAt";
      for (const key of [createdAt, updatedAt]) {
        if (!(key in this.fields)) {
          throw new Error(
            `table "${this.name}" timestamps field "${key}" is not declared in fields`,
          );
        }
      }
      this.timestampFields = { createdAt, updatedAt };
    }

    if (options.history) {
      const config = options.history === true ? {} : options.history;
      const limit = config.limit ?? 20;
      this.history = { limit: Math.max(0, Math.floor(limit)) };
    }

    if (!(this.primaryKey.key in this.fields)) {
      throw new Error(
        `table "${this.name}" primary key "${this.primaryKey.key}" is not a declared field`,
      );
    }
    const storageNames = new Set<string>();
    for (const [key, field] of Object.entries(this.fields)) {
      if (storageNames.has(field.name)) {
        throw new Error(
          `table "${this.name}" declares two fields with storage name "${field.name}" (check field "${key}")`,
        );
      }
      storageNames.add(field.name);
    }
  }

  /** The engine/queue-facing identity of this table. */
  get entitySetName(): string {
    return this.name;
  }

  /** Primary id of a transformed record. */
  getPrimaryId(value: Partial<InferRecord<TFields>>): string | undefined {
    const id = (value as AnyRecord)?.[this.primaryKey.key];
    return id == null || id === "" ? undefined : String(id);
  }

  /** Concrete record-file name for an id. */
  recordFileName(id: RecordId): string {
    return recordFileName(id);
  }

  /** Relative path used in storage error messages. */
  protected pathFor(fileName: string): string {
    return `${this.name}/${fileName}`;
  }

  protected contextAt(
    operation: FileSystemOperation,
    path: string,
    recordId?: string,
  ): StorageContext & { operation: FileSystemOperation } {
    return {
      operation,
      path,
      table: this.name,
      recordId,
      root: this.db.root.name,
      retry: this.retry,
    };
  }

  /** Context attached to storage failures for this table. */
  protected contextFor(
    operation: FileSystemOperation,
    fileName: string,
    recordId?: string,
  ): StorageContext & { operation: FileSystemOperation } {
    return this.contextAt(operation, this.pathFor(fileName), recordId);
  }

  /** Context for errors about the table's own folder/container. */
  protected containerContext(
    operation: FileSystemOperation,
  ): StorageContext & { operation: FileSystemOperation } {
    return this.contextAt(operation, this.name);
  }

  // --- table folder + metadata ---

  protected async tableDirectory(
    create: boolean,
    options: ReadOptions = {},
  ): Promise<FsDirectoryHandle | null> {
    return create
      ? getSubdirectory(
          this.db.root,
          this.name,
          { create: true, signal: options.signal },
          this.containerContext("create-directory"),
        )
      : trySubdirectory(this.db.root, this.name, options, this.containerContext("read"));
  }

  protected async metaDirectory(
    create: boolean,
    options: ReadOptions = {},
  ): Promise<FsDirectoryHandle | null> {
    const table = await this.tableDirectory(create, options);
    if (!table) return null;
    const path = `${this.name}/.meta`;
    return create
      ? getSubdirectory(
          table,
          ".meta",
          { create: true, signal: options.signal },
          this.contextAt("create-directory", path),
        )
      : trySubdirectory(table, ".meta", options, this.contextAt("read", path));
  }

  private metadataDescriptor(): Omit<FileSystemTableMetadata, "createdAt" | "updatedAt"> {
    return {
      format: "filesystem-schema/table",
      version: this.schemaVersion,
      kind: this.layout,
      brandId: this.db.manifest.brandId,
      primaryKey: this.primaryKey.key,
      trash: this.trashEnabled,
      ...(this.history ? { history: { limit: this.history.limit } } : {}),
      ...(this.timestampFields ? { timestamps: { ...this.timestampFields } } : {}),
    };
  }

  private async createOrUpdateMetadata(options: ReadOptions): Promise<FileSystemTableMetadata> {
    const meta = await this.metaDirectory(true, options);
    if (!meta) throw new Error(`could not create metadata folder for table "${this.name}"`);
    const path = `${this.name}/.meta/table.json`;
    const text = await readTextFile(meta, "table.json", options, this.contextAt("read", path));
    const now = new Date().toISOString();

    if (text === null || text.trim() === "") {
      const metadata: FileSystemTableMetadata = {
        ...this.metadataDescriptor(),
        createdAt: now,
        updatedAt: now,
      };
      await writeTextFile(
        meta,
        "table.json",
        serializeJson(metadata),
        options,
        this.contextAt("write", path),
      );
      return metadata;
    }

    const parsed = parseJsonText(text, path);
    if (
      !isRecord(parsed) ||
      parsed.format !== "filesystem-schema/table" ||
      (typeof parsed.version !== "string" && typeof parsed.version !== "number") ||
      (parsed.kind !== "folder" && parsed.kind !== "single-file") ||
      typeof parsed.brandId !== "string" ||
      typeof parsed.primaryKey !== "string" ||
      typeof parsed.trash !== "boolean" ||
      typeof parsed.createdAt !== "string" ||
      typeof parsed.updatedAt !== "string"
    ) {
      throw new Error(`${path} is not a valid filesystem-schema table metadata file`);
    }
    const existing = parsed as unknown as FileSystemTableMetadata;
    if (existing.brandId !== this.db.manifest.brandId) {
      throw new Error(
        `table "${this.name}" metadata belongs to brandId "${existing.brandId}", expected "${this.db.manifest.brandId}"`,
      );
    }
    if (existing.kind !== this.layout) {
      throw new Error(
        `table "${this.name}" metadata kind is "${existing.kind}", but code declares "${this.layout}"`,
      );
    }
    if (existing.primaryKey !== this.primaryKey.key) {
      throw new Error(
        `table "${this.name}" metadata primary key is "${existing.primaryKey}", but code declares "${this.primaryKey.key}"`,
      );
    }

    const desired: FileSystemTableMetadata = {
      ...this.metadataDescriptor(),
      createdAt: existing.createdAt,
      updatedAt: existing.updatedAt,
    };
    if (JSON.stringify(desired) === JSON.stringify(existing)) return existing;

    const metadata: FileSystemTableMetadata = { ...desired, updatedAt: now };
    await writeTextFile(
      meta,
      "table.json",
      serializeJson(metadata),
      options,
      this.contextAt("write", path),
    );
    return metadata;
  }

  /**
   * Creates or validates `<table>/.meta/table.json`. Called automatically before
   * mutations; also exposed as {@link getMetadata}.
   */
  async ensureTableMetadata(options: ReadOptions = {}): Promise<FileSystemTableMetadata> {
    if (!this._metadataPromise) {
      this._metadataPromise = this.createOrUpdateMetadata(options).catch((error) => {
        this._metadataPromise = undefined;
        throw error;
      });
    }
    return this._metadataPromise;
  }

  /** Reads (creating if necessary) the table metadata file. */
  async getMetadata(options: ReadOptions = {}): Promise<FileSystemTableMetadata> {
    return this.ensureTableMetadata(options);
  }

  /**
   * Raw JSON object → transformed record. `idOverride` is the id encoded by the
   * file name (folder tables) or the array entry's primary key; a conflicting
   * id inside the object throws.
   */
  transformRecordFromStorage(raw: unknown, idOverride?: string): InferRecord<TFields> {
    if (!isRecord(raw)) {
      throw new Error(`record in table "${this.name}" must be a JSON object`);
    }
    const out: AnyRecord = {};
    for (const [key, field] of Object.entries(this.fields) as Array<[string, FieldBase<any>]>) {
      let stored = raw[field.name];
      if (key === this.primaryKey.key) {
        if (stored == null && idOverride !== undefined) {
          stored = idOverride;
        } else if (stored != null && idOverride !== undefined && String(stored) !== idOverride) {
          throw new Error(
            `record in table "${this.name}" has id "${String(stored)}" but is stored under id "${idOverride}"`,
          );
        }
      }
      const value = field.fromStorage(stored);
      out[key] = value == null ? value : field.validate(value, `field "${key}" in table "${this.name}"`);
    }
    return this.validateRecord(out as InferRecord<TFields>);
  }

  /** Transformed record partial → JSON object (only declared fields). */
  transformRecordToStorage(value: Record<string, unknown>): AnyRecord {
    const out: AnyRecord = {};
    for (const [key, field] of Object.entries(this.fields) as Array<[string, FieldBase<any>]>) {
      if (!(key in value)) continue;
      const raw = value[key];
      const validated = raw == null ? raw : field.validate(raw, `field "${key}" in table "${this.name}"`);
      out[field.name] = field.toStorage(validated);
    }
    return out;
  }

  protected validateRecord(record: InferRecord<TFields>): InferRecord<TFields> {
    if (!this.schema) return record;
    return validateStandardSync(this.schema, record, `record in table "${this.name}"`) as InferRecord<TFields>;
  }

  protected withRevision<T extends object>(record: T, revision: string): WithRevision<T> {
    return { ...record, [REVISION_KEY]: revision } as WithRevision<T>;
  }

  /** Path used in revision-conflict errors for a record. */
  protected recordPathFor(id: RecordId): string {
    return this.pathFor(recordFileName(id));
  }

  /** Throws a conflict when an `ifMatch` revision no longer matches. */
  protected assertRevision(
    operation: FileSystemOperation,
    id: RecordId,
    actual: string,
    ifMatch?: string,
  ): void {
    const expected = ifMatch?.trim();
    if (!expected || expected === "*") return;
    if (expected !== actual) {
      throw new FileSystemConflictError(
        this.contextAt(operation, this.recordPathFor(id), String(id)),
        expected,
        actual,
      );
    }
  }

  /** Resolves the id for a new record, generating a UUID when omitted. */
  protected resolveCreateId(value: Partial<InferRecord<TFields>>): string {
    const supplied = (value as AnyRecord)?.[this.primaryKey.key];
    if (supplied != null && String(supplied) !== "") return String(supplied);
    const uuid = globalThis.crypto?.randomUUID?.();
    if (!uuid) {
      throw new Error(
        "cannot generate a record id — crypto.randomUUID is unavailable; provide the primary key explicitly",
      );
    }
    return uuid;
  }

  /** Rejects a patch that tries to change the record's id. */
  protected assertPatchId(id: RecordId, value: Partial<InferRecord<TFields>>): void {
    const supplied = (value as AnyRecord)?.[this.primaryKey.key];
    if (supplied != null && String(supplied) !== String(id)) {
      throw new Error(
        `cannot change primary key "${this.primaryKey.key}" from "${String(id)}" to "${String(supplied)}"`,
      );
    }
  }

  // --- timestamps ---

  protected applyCreateTimestamps(record: AnyRecord): AnyRecord {
    if (!this.timestampFields) return record;
    const now = new Date();
    return {
      ...record,
      [this.timestampFields.createdAt]: record[this.timestampFields.createdAt] ?? now,
      [this.timestampFields.updatedAt]: now,
    };
  }

  protected applyUpdateTimestamps(record: AnyRecord, existing?: AnyRecord): AnyRecord {
    if (!this.timestampFields) return record;
    const now = new Date();
    return {
      ...record,
      [this.timestampFields.createdAt]:
        existing?.[this.timestampFields.createdAt] ?? record[this.timestampFields.createdAt] ?? now,
      [this.timestampFields.updatedAt]: now,
    };
  }

  // --- trash ---

  protected trashPath(fileName?: string): string {
    return [this.name, ".meta", "trash", ...(fileName ? [fileName] : [])].join("/");
  }

  protected async trashDirectory(
    create: boolean,
    options: ReadOptions = {},
  ): Promise<FsDirectoryHandle | null> {
    const meta = await this.metaDirectory(create, options);
    if (!meta) return null;
    return create
      ? getSubdirectory(
          meta,
          "trash",
          { create: true, signal: options.signal },
          this.contextAt("create-directory", this.trashPath()),
        )
      : trySubdirectory(meta, "trash", options, this.contextAt("read", this.trashPath()));
  }

  protected async writeTrashEntry(
    id: RecordId,
    data: unknown,
    options: ReadOptions = {},
  ): Promise<string> {
    await this.ensureTableMetadata(options);
    const directory = await this.trashDirectory(true, options);
    const fileName = uniqueJsonFileName();
    const entry: TrashEntry = {
      id: String(id),
      deletedAt: new Date().toISOString(),
      data,
    };
    await writeTextFile(
      directory!,
      fileName,
      serializeJson(entry),
      options,
      this.contextAt("write", this.trashPath(fileName), String(id)),
    );
    return fileName;
  }

  protected async removeTrashFile(fileName: string, options: ReadOptions = {}): Promise<void> {
    const directory = await this.trashDirectory(false, options);
    if (!directory) return;
    await removeFile(
      directory,
      fileName,
      options,
      this.contextAt("delete", this.trashPath(fileName)),
    );
  }

  protected async listTrashEntries(options: ReadOptions = {}): Promise<TrashEntryInfo[]> {
    const directory = await this.trashDirectory(false, options);
    if (!directory) return [];
    const entries = await listDirectory(
      directory,
      options,
      this.contextAt("list", this.trashPath()),
    );
    const out: TrashEntryInfo[] = [];
    for (const entry of entries) {
      if (entry.kind !== "file" || !entry.name.endsWith(".json")) continue;
      const text = await readTextFile(
        directory,
        entry.name,
        options,
        this.contextAt("read", this.trashPath(entry.name)),
      );
      if (text === null || text.trim() === "") continue;
      const parsed = parseTrashEntry(text, this.trashPath(entry.name));
      out.push({ id: parsed.id, deletedAt: parsed.deletedAt, fileName: entry.name });
    }
    out.sort(
      (left, right) =>
        right.deletedAt.localeCompare(left.deletedAt) ||
        right.fileName.localeCompare(left.fileName),
    );
    return out;
  }

  protected async readTrashEntryData(
    id: RecordId,
    options: ReadOptions = {},
  ): Promise<{ fileName: string; entry: TrashEntry } | null> {
    const entries = (await this.listTrashEntries(options)).filter(
      (entry) => entry.id === String(id),
    );
    if (entries.length === 0) return null;
    const newest = entries[0]!;
    const directory = await this.trashDirectory(false, options);
    if (!directory) return null;
    const text = await readTextFile(
      directory,
      newest.fileName,
      options,
      this.contextAt("read", this.trashPath(newest.fileName), String(id)),
    );
    if (text === null) return null;
    return {
      fileName: newest.fileName,
      entry: parseTrashEntry(text, this.trashPath(newest.fileName)),
    };
  }

  /** Lists soft-deleted records, newest first. */
  async listTrash(options: ReadOptions = {}): Promise<TrashEntryInfo[]> {
    return this.listTrashEntries(options);
  }

  /** Permanently removes one record's trash entries, or all entries when no id is given. */
  async purgeTrash(id?: RecordId, options: ReadOptions = {}): Promise<number> {
    const entries = await this.listTrashEntries(options);
    const filtered = id === undefined
      ? entries
      : entries.filter((entry) => entry.id === String(id));
    if (filtered.length === 0) return 0;
    const directory = await this.trashDirectory(false, options);
    if (!directory) return 0;
    for (const entry of filtered) {
      await removeFile(
        directory,
        entry.fileName,
        options,
        this.contextAt("delete", this.trashPath(entry.fileName), entry.id),
      );
    }
    return filtered.length;
  }

  // --- history ---

  protected historyPath(id: RecordId, fileName?: string): string {
    return [this.name, ".meta", "history", recordIdSegment(id), ...(fileName ? [fileName] : [])].join("/");
  }

  protected async historyDirectory(
    id: RecordId,
    create: boolean,
    options: ReadOptions = {},
  ): Promise<FsDirectoryHandle | null> {
    const meta = await this.metaDirectory(create, options);
    if (!meta) return null;

    const historyRoot = create
      ? await getSubdirectory(
          meta,
          "history",
          { create: true, signal: options.signal },
          this.contextAt("create-directory", `${this.name}/.meta/history`),
        )
      : await trySubdirectory(
          meta,
          "history",
          options,
          this.contextAt("read", `${this.name}/.meta/history`),
        );
    if (!historyRoot) return null;

    const segment = recordIdSegment(id);
    return create
      ? getSubdirectory(
          historyRoot,
          segment,
          { create: true, signal: options.signal },
          this.contextAt("create-directory", `${this.name}/.meta/history/${segment}`),
        )
      : trySubdirectory(
          historyRoot,
          segment,
          options,
          this.contextAt("read", `${this.name}/.meta/history/${segment}`),
        );
  }

  protected async writeHistorySnapshot(
    id: RecordId,
    data: unknown,
    options: ReadOptions = {},
  ): Promise<void> {
    if (!this.history) return;
    await this.ensureTableMetadata(options);
    const directory = await this.historyDirectory(id, true, options);
    if (!directory) return;
    const fileName = uniqueJsonFileName();
    const entry: HistoryFile = { savedAt: new Date().toISOString(), data };
    await writeTextFile(
      directory,
      fileName,
      serializeJson(entry),
      options,
      this.contextAt("write", this.historyPath(id, fileName), String(id)),
    );

    const limit = this.history.limit;
    if (limit <= 0) return;
    const entries = await listDirectory(
      directory,
      options,
      this.contextAt("list", this.historyPath(id), String(id)),
    );
    const files = entries
      .filter((entry) => entry.kind === "file" && entry.name.endsWith(".json"))
      .map((entry) => entry.name)
      .sort();
    const excess = files.length - limit;
    for (let index = 0; index < excess; index++) {
      const file = files[index]!;
      await removeFile(
        directory,
        file,
        options,
        this.contextAt("delete", this.historyPath(id, file), String(id)),
      );
    }
  }

  protected async listHistoryFiles(
    id: RecordId,
    options: ReadOptions = {},
  ): Promise<HistoryEntryInfo[]> {
    const directory = await this.historyDirectory(id, false, options);
    if (!directory) return [];
    const entries = await listDirectory(
      directory,
      options,
      this.contextAt("list", this.historyPath(id), String(id)),
    );
    const out: HistoryEntryInfo[] = [];
    for (const entry of entries) {
      if (entry.kind !== "file" || !entry.name.endsWith(".json")) continue;
      const text = await readTextFile(
        directory,
        entry.name,
        options,
        this.contextAt("read", this.historyPath(id, entry.name), String(id)),
      );
      if (text === null || text.trim() === "") continue;
      const parsed = parseHistoryFile(text, this.historyPath(id, entry.name));
      out.push({ fileName: entry.name, savedAt: parsed.savedAt });
    }
    out.sort(
      (left, right) =>
        right.savedAt.localeCompare(left.savedAt) || right.fileName.localeCompare(left.fileName),
    );
    return out;
  }

  /** Lists snapshots for one record, newest first. */
  async listHistory(id: RecordId, options: ReadOptions = {}): Promise<HistoryEntryInfo[]> {
    return this.listHistoryFiles(id, options);
  }

  protected async readHistoryEntry(
    id: RecordId,
    fileName: string,
    options: ReadOptions = {},
  ): Promise<HistoryEntry> {
    const directory = await this.historyDirectory(id, false, options);
    if (!directory) throw new Error(`no history found for record "${String(id)}" in table "${this.name}"`);
    const text = await readTextFile(
      directory,
      fileName,
      options,
      this.contextAt("read", this.historyPath(id, fileName), String(id)),
    );
    if (text === null) {
      throw new Error(`history snapshot "${fileName}" not found for record "${String(id)}" in table "${this.name}"`);
    }
    const parsed = parseHistoryFile(text, this.historyPath(id, fileName));
    return { fileName, savedAt: parsed.savedAt, data: parsed.data };
  }
}

/**
 * Folder-backed table: `<root>/<table>/<id>.json` per record.
 *
 * @example
 * const Tasks = db.table({
 *   name: "tasks",
 *   fields: {
 *     id: primaryKey(),
 *     title: text("title"),
 *     done: bool("done"),
 *     due: date("due"),
 *   },
 * });
 * const task = await Tasks.createRecord({ title: "Ship it" });
 */
export class FileSystemTable<
  TFields extends Record<string, FieldBase<any>>,
> extends FileSystemTableBase<TFields> {
  readonly layout = "folder" as const;

  constructor(options: FileSystemTableOptions<TFields>) {
    super(options);
    assertSafeSegment(options.name, "table name");
    if (options.name === this.db.manifestFile) {
      throw new Error(
        `table "${options.name}" cannot use the root manifest file name "${this.db.manifestFile}"`,
      );
    }
  }

  /** The table folder, if it exists. */
  async directory(options: ReadOptions = {}): Promise<FsDirectoryHandle | null> {
    return this.tableDirectory(false, options);
  }

  async getRecord(
    id: RecordId,
    options: ReadOptions = {},
  ): Promise<WithRevision<InferRecord<TFields>> | null> {
    const directory = await this.directory(options);
    if (!directory) return null;
    const fileName = recordFileName(id);
    const text = await readTextFile(
      directory,
      fileName,
      options,
      this.contextFor("read", fileName, String(id)),
    );
    if (text === null || text.trim() === "") return null;
    const raw = parseJsonText(text, `record "${String(id)}" in table "${this.name}"`);
    const record = this.transformRecordFromStorage(raw, String(id));
    return this.withRevision(record, revisionOfText(text));
  }

  async getRecords(
    options: ReadOptions = {},
  ): Promise<Array<WithRevision<InferRecord<TFields>>>> {
    const directory = await this.directory(options);
    if (!directory) return [];
    const entries = await listDirectory(directory, options, this.containerContext("list"));
    const records: Array<WithRevision<InferRecord<TFields>>> = [];
    for (const entry of entries) {
      if (entry.kind !== "file") continue;
      const id = recordIdFromFileName(entry.name);
      if (id === null) continue;
      const text = await readTextFile(
        directory,
        entry.name,
        options,
        this.contextFor("read", entry.name, id),
      );
      if (text === null) continue; // removed between listing and reading
      if (text.trim() === "") continue; // empty file left by an interrupted create
      const raw = parseJsonText(text, `record "${id}" in table "${this.name}"`);
      records.push(
        this.withRevision(this.transformRecordFromStorage(raw, id), revisionOfText(text)),
      );
    }
    records.sort((left, right) =>
      String((left as AnyRecord)[this.primaryKey.key]).localeCompare(
        String((right as AnyRecord)[this.primaryKey.key]),
      ),
    );
    return records;
  }

  async hasRecord(id: RecordId, options: ReadOptions = {}): Promise<boolean> {
    const directory = await this.directory(options);
    if (!directory) return false;
    const fileName = recordFileName(id);
    return fileExists(
      directory,
      fileName,
      options,
      this.contextFor("read", fileName, String(id)),
    );
  }

  async createRecord(
    value: Partial<InferRecord<TFields>>,
    options: WriteOptions = {},
  ): Promise<WithRevision<InferRecord<TFields>>> {
    const id = this.resolveCreateId(value);
    await this.ensureTableMetadata(options);
    const directory = (await this.tableDirectory(true, options))!;
    const fileName = recordFileName(id);
    if (await fileExists(directory, fileName, options, this.contextFor("read", fileName, id))) {
      throw new Error(`record "${id}" already exists in table "${this.name}"`);
    }
    const record = this.applyCreateTimestamps({
      ...(value as AnyRecord),
      [this.primaryKey.key]: id,
    });
    const storage = this.transformRecordToStorage(record);
    // Validate (including the table-level schema) before touching the file.
    const transformed = this.transformRecordFromStorage(storage, id);
    const text = serializeJson(storage);
    await this.ensureTableMetadata(options);
    await writeTextFile(
      directory,
      fileName,
      text,
      options,
      this.contextFor("write", fileName, id),
    );
    return this.withRevision(transformed, revisionOfText(text));
  }

  async updateRecord(
    id: RecordId,
    value: Partial<InferRecord<TFields>>,
    options: WriteOptions = {},
  ): Promise<WithRevision<InferRecord<TFields>>> {
    this.assertPatchId(id, value);
    const directory = await this.directory(options);
    const fileName = recordFileName(id);
    const text = directory
      ? await readTextFile(
          directory,
          fileName,
          options,
          this.contextFor("read", fileName, String(id)),
        )
      : null;
    if (!directory || text === null || text.trim() === "") {
      throw new Error(`record "${String(id)}" not found in table "${this.name}"`);
    }
    const raw = parseJsonText(text, `record "${String(id)}" in table "${this.name}"`);
    const existing = this.transformRecordFromStorage(raw, String(id));
    this.assertRevision("write", id, revisionOfText(text), options.ifMatch);

    const merged = {
      ...(existing as AnyRecord),
      ...withoutUndefined(value as AnyRecord),
      [this.primaryKey.key]: String(id),
    };
    const timestamped = this.applyUpdateTimestamps(merged, existing as AnyRecord);
    const storage = this.transformRecordToStorage(timestamped);
    const transformed = this.transformRecordFromStorage(storage, String(id));

    await this.ensureTableMetadata(options);
    if (this.history) {
      await this.writeHistorySnapshot(id, raw, options);
    }
    const nextText = serializeJson(storage);
    await writeTextFile(
      directory,
      fileName,
      nextText,
      options,
      this.contextFor("write", fileName, String(id)),
    );
    return this.withRevision(transformed, revisionOfText(nextText));
  }

  async upsertRecord(
    id: RecordId,
    value: Partial<InferRecord<TFields>>,
    options: WriteOptions = {},
  ): Promise<WithRevision<InferRecord<TFields>>> {
    this.assertPatchId(id, value);
    if (await this.hasRecord(id, options)) return this.updateRecord(id, value, options);
    const record = { ...(value as AnyRecord), [this.primaryKey.key]: String(id) };
    return this.createRecord(record as Partial<InferRecord<TFields>>, options);
  }

  async deleteRecord(id: RecordId, options: DeleteOptions = {}): Promise<string> {
    const directory = await this.directory(options);
    const fileName = recordFileName(id);
    if (!directory) {
      if (options.ifMissing === "ignore") return String(id);
      throw new Error(`record "${String(id)}" not found in table "${this.name}"`);
    }

    const soft = this.trashEnabled && options.permanent !== true;
    const needsRead = Boolean(options.ifMatch || soft || this.history);
    let text: string | null = null;
    let raw: AnyRecord | undefined;
    if (needsRead) {
      text = await readTextFile(
        directory,
        fileName,
        options,
        this.contextFor("read", fileName, String(id)),
      );
      if (text === null || text.trim() === "") {
        if (options.ifMissing === "ignore") return String(id);
        throw new Error(`record "${String(id)}" not found in table "${this.name}"`);
      }
      const parsed = parseJsonText(text, `record "${String(id)}" in table "${this.name}"`);
      if (!isRecord(parsed)) {
        throw new Error(`record "${String(id)}" in table "${this.name}" must be a JSON object`);
      }
      raw = parsed;
      this.transformRecordFromStorage(raw, String(id)); // validate before side effects
      this.assertRevision("delete", id, revisionOfText(text), options.ifMatch);
    }

    await this.ensureTableMetadata(options);
    if (soft) {
      const trashFile = await this.writeTrashEntry(id, raw, options);
      try {
        await removeFile(
          directory,
          fileName,
          options,
          this.contextFor("delete", fileName, String(id)),
        );
      } catch (error) {
        await this.removeTrashFile(trashFile, { signal: options.signal }).catch(() => {});
        throw error;
      }
      return String(id);
    }

    if (this.history && raw !== undefined) {
      await this.writeHistorySnapshot(id, raw, options);
    }
    const removed = await removeFile(
      directory,
      fileName,
      options,
      this.contextFor("delete", fileName, String(id)),
    );
    if (!removed && options.ifMissing !== "ignore") {
      throw new Error(`record "${String(id)}" not found in table "${this.name}"`);
    }
    return String(id);
  }

  async restoreRecord(
    id: RecordId,
    options: RestoreRecordOptions = {},
  ): Promise<WithRevision<InferRecord<TFields>>> {
    const found = await this.readTrashEntryData(id, options);
    if (!found) {
      throw new Error(`no trash entry for record "${String(id)}" in table "${this.name}"`);
    }
    if (!isRecord(found.entry.data)) {
      throw new Error(`trash entry "${found.fileName}" for table "${this.name}" has invalid record data`);
    }
    const directory = await getSubdirectory(
      this.db.root,
      this.name,
      { create: true, signal: options.signal },
      this.containerContext("create-directory"),
    );
    const fileName = recordFileName(id);
    const exists = await fileExists(
      directory,
      fileName,
      options,
      this.contextFor("read", fileName, String(id)),
    );
    if (exists && options.ifExists !== "overwrite") {
      throw new Error(`record "${String(id)}" already exists in table "${this.name}"`);
    }
    if (exists) {
      const currentText = await readTextFile(
        directory,
        fileName,
        options,
        this.contextFor("read", fileName, String(id)),
      );
      if (currentText !== null && currentText.trim() !== "") {
        this.assertRevision("write", id, revisionOfText(currentText), options.ifMatch);
        if (this.history) {
          const currentRaw = parseJsonText(
            currentText,
            `record "${String(id)}" in table "${this.name}"`,
          );
          if (isRecord(currentRaw)) await this.writeHistorySnapshot(id, currentRaw, options);
        }
      }
    }

    const storage = this.transformRecordToStorage(found.entry.data);
    const transformed = this.transformRecordFromStorage(storage, String(id));
    const text = serializeJson(storage);
    await this.ensureTableMetadata(options);
    await writeTextFile(
      directory,
      fileName,
      text,
      options,
      this.contextFor("write", fileName, String(id)),
    );
    await this.removeTrashFile(found.fileName, options);
    return this.withRevision(transformed, revisionOfText(text));
  }

  async restoreHistory(
    id: RecordId,
    fileName: string,
    options: RestoreHistoryOptions = {},
  ): Promise<WithRevision<InferRecord<TFields>>> {
    const entry = await this.readHistoryEntry(id, fileName, options);
    if (!isRecord(entry.data)) {
      throw new Error(`history snapshot "${fileName}" for table "${this.name}" has invalid record data`);
    }
    const directory = await getSubdirectory(
      this.db.root,
      this.name,
      { create: true, signal: options.signal },
      this.containerContext("create-directory"),
    );
    const recordFile = recordFileName(id);
    const exists = await fileExists(
      directory,
      recordFile,
      options,
      this.contextFor("read", recordFile, String(id)),
    );
    if (exists && options.ifExists === "throw") {
      throw new Error(`record "${String(id)}" already exists in table "${this.name}"`);
    }
    if (exists) {
      const currentText = await readTextFile(
        directory,
        recordFile,
        options,
        this.contextFor("read", recordFile, String(id)),
      );
      if (currentText !== null && currentText.trim() !== "") {
        this.assertRevision("write", id, revisionOfText(currentText), options.ifMatch);
        if (this.history) {
          const currentRaw = parseJsonText(
            currentText,
            `record "${String(id)}" in table "${this.name}"`,
          );
          if (isRecord(currentRaw)) await this.writeHistorySnapshot(id, currentRaw, options);
        }
      }
    }

    const storage = this.transformRecordToStorage(entry.data);
    const transformed = this.transformRecordFromStorage(storage, String(id));
    const text = serializeJson(storage);
    await this.ensureTableMetadata(options);
    await writeTextFile(
      directory,
      recordFile,
      text,
      options,
      this.contextFor("write", recordFile, String(id)),
    );
    return this.withRevision(transformed, revisionOfText(text));
  }

  /**
   * Watches the table folder with Chromium's `FileSystemObserver` and emits
   * record-level events. Returns a disposer.
   */
  async watch(
    onEvent: (
      event: TableWatchEvent<WithRevision<InferRecord<TFields>>>,
    ) => void | Promise<void>,
    options: TableWatchOptions = {},
  ): Promise<() => void> {
    const directory = await getSubdirectory(
      this.db.root,
      this.name,
      { create: true, signal: options.signal },
      this.containerContext("create-directory"),
    );
    return observeHandle(
      directory,
      async (change) => {
        if (change.changedHandle.kind !== "file") return;
        const components = change.relativePathComponents;
        if (components && components.length > 1) return; // ignore nested/internal paths
        const fileName = change.changedHandle.name;
        const id = recordIdFromFileName(fileName);
        if (id === null) return;
        const type = mapObserverChangeType(change.type);
        let record: WithRevision<InferRecord<TFields>> | undefined;
        if (
          options.loadRecord !== false &&
          (type === "created" || type === "updated" || type === "moved")
        ) {
          record = (await this.getRecord(id, { signal: options.signal })) ?? undefined;
        }
        const event: TableWatchEvent<WithRevision<InferRecord<TFields>>> = {
          type,
          fileName,
          id,
        };
        if (record !== undefined) event.record = record;
        await onEvent(event);
      },
      options,
    );
  }
}

/**
 * Single-file table: every record lives in one JSON array file inside a table
 * folder (`<table>/data.json` by default).
 *
 * Writes replace the whole file, so this layout is intended for small tables
 * (settings, reference data, a few records). Use {@link FileSystemTable} for
 * larger, independently-written collections.
 */
export class FileSystemSingleFileTable<
  TFields extends Record<string, FieldBase<any>>,
> extends FileSystemTableBase<TFields> {
  readonly layout = "single-file" as const;
  readonly fileName: string;

  constructor(options: FileSystemSingleFileTableOptions<TFields>) {
    super(options);
    assertSafeSegment(options.name, "table name");
    if (options.name === this.db.manifestFile) {
      throw new Error(
        `table "${options.name}" cannot use the root manifest file name "${this.db.manifestFile}"`,
      );
    }
    this.fileName = ensureJsonFileName(options.fileName ?? "data.json", "data file name");
  }

  /** Conflicts are about the single array file, not a per-record file. */
  protected override recordPathFor(_id: RecordId): string {
    return this.pathFor(this.fileName);
  }

  private async readRaw(
    options: ReadOptions = {},
    recordId?: string,
  ): Promise<{ records: AnyRecord[]; text: string | null }> {
    const directory = await this.tableDirectory(false, options);
    if (!directory) return { records: [], text: null };
    const text = await readTextFile(
      directory,
      this.fileName,
      options,
      this.contextFor("read", this.fileName, recordId),
    );
    if (text === null || text.trim() === "") return { records: [], text };
    const parsed = parseJsonText(text, `single-file table "${this.name}" (${this.fileName})`);
    if (!Array.isArray(parsed)) {
      throw new Error(`single-file table "${this.name}" (${this.fileName}) must contain a JSON array of records`);
    }
    const records = parsed.map((entry, index) => {
      if (!isRecord(entry)) {
        throw new Error(
          `single-file table "${this.name}" (${this.fileName}): record at index ${index} must be a JSON object`,
        );
      }
      return entry;
    });
    return { records, text };
  }

  private async writeRawRecords(
    records: AnyRecord[],
    options: ReadOptions = {},
    recordId?: string,
  ): Promise<string> {
    await this.ensureTableMetadata(options);
    const directory = await this.tableDirectory(true, options);
    const text = serializeJson(records);
    await writeTextFile(
      directory!,
      this.fileName,
      text,
      options,
      this.contextFor("write", this.fileName, recordId),
    );
    return text;
  }

  private rawId(raw: AnyRecord): string | undefined {
    const field = this.fields[this.primaryKey.key]!;
    const id = raw[field.name];
    return id == null || id === "" ? undefined : String(id);
  }

  private findIndex(records: AnyRecord[], id: RecordId): number {
    return records.findIndex((raw) => this.rawId(raw) === String(id));
  }

  private transformAll(records: AnyRecord[], revision?: string): Array<WithRevision<InferRecord<TFields>>> {
    const seen = new Set<string>();
    const out = records.map((raw, index) => {
      const id = this.rawId(raw);
      if (id === undefined) {
        const field = this.fields[this.primaryKey.key]!;
        throw new Error(
          `single-file table "${this.name}" (${this.fileName}): record at index ${index} is missing primary key "${field.name}"`,
        );
      }
      if (seen.has(id)) {
        throw new Error(
          `single-file table "${this.name}" (${this.fileName}): duplicate primary key "${id}"`,
        );
      }
      seen.add(id);
      const record = this.transformRecordFromStorage(raw, id);
      return revision ? this.withRevision(record, revision) : record;
    });
    out.sort((left, right) =>
      String((left as AnyRecord)[this.primaryKey.key]).localeCompare(
        String((right as AnyRecord)[this.primaryKey.key]),
      ),
    );
    return out;
  }

  async getRecord(
    id: RecordId,
    options: ReadOptions = {},
  ): Promise<WithRevision<InferRecord<TFields>> | null> {
    const { records, text } = await this.readRaw(options, String(id));
    const index = this.findIndex(records, id);
    if (index < 0) return null;
    const record = this.transformRecordFromStorage(records[index], String(id));
    return text ? this.withRevision(record, revisionOfText(text)) : record;
  }

  async getRecords(
    options: ReadOptions = {},
  ): Promise<Array<WithRevision<InferRecord<TFields>>>> {
    const { records, text } = await this.readRaw(options);
    return this.transformAll(records, text ? revisionOfText(text) : undefined);
  }

  async hasRecord(id: RecordId, options: ReadOptions = {}): Promise<boolean> {
    return this.findIndex((await this.readRaw(options, String(id))).records, id) >= 0;
  }

  async createRecord(
    value: Partial<InferRecord<TFields>>,
    options: WriteOptions = {},
  ): Promise<WithRevision<InferRecord<TFields>>> {
    const id = this.resolveCreateId(value);
    const { records } = await this.readRaw(options, id);
    if (this.findIndex(records, id) >= 0) {
      throw new Error(`record "${id}" already exists in table "${this.name}"`);
    }
    const record = this.applyCreateTimestamps({
      ...(value as AnyRecord),
      [this.primaryKey.key]: id,
    });
    const storage = this.transformRecordToStorage(record);
    const transformed = this.transformRecordFromStorage(storage, id);
    records.push(storage);
    const text = await this.writeRawRecords(records, options, id);
    return this.withRevision(transformed, revisionOfText(text));
  }

  async updateRecord(
    id: RecordId,
    value: Partial<InferRecord<TFields>>,
    options: WriteOptions = {},
  ): Promise<WithRevision<InferRecord<TFields>>> {
    this.assertPatchId(id, value);
    const { records, text } = await this.readRaw(options, String(id));
    const index = this.findIndex(records, id);
    if (index < 0) throw new Error(`record "${String(id)}" not found in table "${this.name}"`);
    if (text !== null) this.assertRevision("write", id, revisionOfText(text), options.ifMatch);
    const oldRaw = records[index]!;
    const existing = this.transformRecordFromStorage(oldRaw, String(id));
    const merged = {
      ...(existing as AnyRecord),
      ...withoutUndefined(value as AnyRecord),
      [this.primaryKey.key]: String(id),
    };
    const timestamped = this.applyUpdateTimestamps(merged, existing as AnyRecord);
    const storage = this.transformRecordToStorage(timestamped);
    const transformed = this.transformRecordFromStorage(storage, String(id));
    if (this.history) await this.writeHistorySnapshot(id, oldRaw, options);
    records[index] = storage;
    const nextText = await this.writeRawRecords(records, options, String(id));
    return this.withRevision(transformed, revisionOfText(nextText));
  }

  async upsertRecord(
    id: RecordId,
    value: Partial<InferRecord<TFields>>,
    options: WriteOptions = {},
  ): Promise<WithRevision<InferRecord<TFields>>> {
    this.assertPatchId(id, value);
    if (await this.hasRecord(id, options)) return this.updateRecord(id, value, options);
    const record = { ...(value as AnyRecord), [this.primaryKey.key]: String(id) };
    return this.createRecord(record as Partial<InferRecord<TFields>>, options);
  }

  async deleteRecord(id: RecordId, options: DeleteOptions = {}): Promise<string> {
    const { records, text } = await this.readRaw(options, String(id));
    const index = this.findIndex(records, id);
    if (index < 0) {
      if (options.ifMissing === "ignore") return String(id);
      throw new Error(`record "${String(id)}" not found in table "${this.name}"`);
    }
    if (text !== null) this.assertRevision("delete", id, revisionOfText(text), options.ifMatch);
    const oldRaw = records[index]!;

    if (this.trashEnabled && options.permanent !== true) {
      const trashFile = await this.writeTrashEntry(id, oldRaw, options);
      records.splice(index, 1);
      try {
        await this.writeRawRecords(records, options, String(id));
      } catch (error) {
        await this.removeTrashFile(trashFile, { signal: options.signal }).catch(() => {});
        throw error;
      }
      return String(id);
    }

    if (this.history) await this.writeHistorySnapshot(id, oldRaw, options);
    records.splice(index, 1);
    await this.writeRawRecords(records, options, String(id));
    return String(id);
  }

  async restoreRecord(
    id: RecordId,
    options: RestoreRecordOptions = {},
  ): Promise<WithRevision<InferRecord<TFields>>> {
    const found = await this.readTrashEntryData(id, options);
    if (!found) {
      throw new Error(`no trash entry for record "${String(id)}" in table "${this.name}"`);
    }
    if (!isRecord(found.entry.data)) {
      throw new Error(`trash entry "${found.fileName}" for table "${this.name}" has invalid record data`);
    }
    const { records, text } = await this.readRaw(options, String(id));
    if (text !== null && text.trim() !== "") {
      this.assertRevision("write", id, revisionOfText(text), options.ifMatch);
    }
    const index = this.findIndex(records, id);
    if (index >= 0 && options.ifExists !== "overwrite") {
      throw new Error(`record "${String(id)}" already exists in table "${this.name}"`);
    }
    const storage = this.transformRecordToStorage(found.entry.data);
    const transformed = this.transformRecordFromStorage(storage, String(id));
    if (index >= 0) {
      if (this.history) await this.writeHistorySnapshot(id, records[index]!, options);
      records[index] = storage;
    } else {
      records.push(storage);
    }
    const nextText = await this.writeRawRecords(records, options, String(id));
    await this.removeTrashFile(found.fileName, options);
    return this.withRevision(transformed, revisionOfText(nextText));
  }

  async restoreHistory(
    id: RecordId,
    fileName: string,
    options: RestoreHistoryOptions = {},
  ): Promise<WithRevision<InferRecord<TFields>>> {
    const entry = await this.readHistoryEntry(id, fileName, options);
    if (!isRecord(entry.data)) {
      throw new Error(`history snapshot "${fileName}" for table "${this.name}" has invalid record data`);
    }
    const { records, text } = await this.readRaw(options, String(id));
    if (text !== null) this.assertRevision("write", id, revisionOfText(text), options.ifMatch);
    const index = this.findIndex(records, id);
    if (index >= 0 && options.ifExists === "throw") {
      throw new Error(`record "${String(id)}" already exists in table "${this.name}"`);
    }
    const storage = this.transformRecordToStorage(entry.data);
    const transformed = this.transformRecordFromStorage(storage, String(id));
    if (index >= 0) {
      if (this.history) await this.writeHistorySnapshot(id, records[index]!, options);
      records[index] = storage;
    } else {
      records.push(storage);
    }
    const nextText = await this.writeRawRecords(records, options, String(id));
    return this.withRevision(transformed, revisionOfText(nextText));
  }

  /**
   * Watches the root for changes to this table's JSON file and emits
   * per-record created/updated/deleted events by diffing the array.
   */
  async watch(
    onEvent: (
      event: TableWatchEvent<WithRevision<InferRecord<TFields>>>,
    ) => void | Promise<void>,
    options: TableWatchOptions = {},
  ): Promise<() => void> {
    const fingerprint = (record: AnyRecord): string => {
      const { [REVISION_KEY]: _revision, ...rest } = record;
      return JSON.stringify(rest);
    };
    const snapshot = async (): Promise<Map<string, { fingerprint: string; record: WithRevision<InferRecord<TFields>> }>> => {
      const records = await this.getRecords({ signal: options.signal });
      return new Map(
        records.map((record) => {
          const id = String((record as AnyRecord)[this.primaryKey.key]);
          return [id, { fingerprint: fingerprint(record as AnyRecord), record }];
        }),
      );
    };

    const directory = await this.tableDirectory(true, options);
    let previous = await snapshot();
    return observeHandle(
      directory!,
      async (change) => {
        if (change.changedHandle.kind !== "file" || change.changedHandle.name !== this.fileName) {
          return;
        }
        const components = change.relativePathComponents;
        if (components && components.length > 1) return; // ignore nested paths
        if (change.type === "disappeared") {
          for (const [id, entry] of previous) {
            const event: TableWatchEvent<WithRevision<InferRecord<TFields>>> = {
              type: "deleted",
              fileName: this.fileName,
              id,
            };
            if (options.loadRecord !== false) event.record = entry.record;
            await onEvent(event);
          }
          previous = new Map();
          return;
        }

        const next = await snapshot();
        for (const [id, entry] of next) {
          const before = previous.get(id);
          if (!before) {
            const event: TableWatchEvent<WithRevision<InferRecord<TFields>>> = {
              type: "created",
              fileName: this.fileName,
              id,
            };
            if (options.loadRecord !== false) event.record = entry.record;
            await onEvent(event);
          } else if (before.fingerprint !== entry.fingerprint) {
            const event: TableWatchEvent<WithRevision<InferRecord<TFields>>> = {
              type: "updated",
              fileName: this.fileName,
              id,
            };
            if (options.loadRecord !== false) event.record = entry.record;
            await onEvent(event);
          }
        }
        for (const [id, entry] of previous) {
          if (!next.has(id)) {
            const event: TableWatchEvent<WithRevision<InferRecord<TFields>>> = {
              type: "deleted",
              fileName: this.fileName,
              id,
            };
            if (options.loadRecord !== false) event.record = entry.record;
            await onEvent(event);
          }
        }
        previous = next;
      },
      options,
    );
  }
}
