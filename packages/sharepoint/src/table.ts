/**
 * Schema-driven access to a SharePoint list (or list-backed library) through
 * the legacy REST API (`_api/web/Lists/GetByTitle(...)/Items`, OData v3).
 *
 * Parity with `DataverseTable` (`packages/dataverse/src/table.ts`): full
 * query-builder plumbing (filter tree, expand, etc.) arrives when the shared
 * `packages/core` is extracted; this first slice covers schema-aware CRUD +
 * record transforms, and structurally satisfies the sync engine's
 * {@link SyncTable} contract so `@offlinecollectionoptions` reuse is trivial.
 */

import { SharePointClient, type QueryRequestOptions, type RequestOptions, type GetRecordOptions, type UpsertRecordOptions, type DeleteRecordOptions } from "./client";
import { FieldBase, FileField, type FileRef, type InferRecord, type TransformContext } from "./fields";
import { SPQuery, spQuery, type QueryProxy } from "./query";
import type { ListItemId, GenericProperties } from "./types";

/** Concurrency/row metadata shared by every REST item (`__metadata`). */
export type ItemMetadata = {
    type?: string;
    etag?: string;
    id?: number;
    uri?: string;
};

export type SharePointTableOptions<TFields extends Record<string, FieldBase<any>>> = {
    client: SharePointClient;
    /** The **display** title of the list (URL-encoded in the REST path). */
    listTitle: string;
    fields: TFields;
    /** Key of the transformed record holding the item id. Default `"id"` (matching `Id`). */
    primaryKey?: string;
    /** The list item content type — used when building `__metadata.type` for writes. */
    listItemEntityTypeFullName?: string;
    /**
     * Optional server-relative root folder override for document libraries
     * (skips the RootFolder fetch). Default: discovered lazily from the list.
     */
    rootFolderUrl?: string;
};

/**
 * CRUD table over one SharePoint list. Constructed directly (there is no
 * `table()` factory — mirrors `DataverseTable`):
 *
 * @example
 * const client = new SharePointClient({ url: "https://contoso.sharepoint.com/sites/dev", token });
 * const Tasks = new SharePointTable({
 *   client,
 *   listTitle: "Tasks",
 *   fields: {
 *     id: primaryKey("Id"),
 *     title: text("Title"),
 *     done: bool("IsDone"),
 *     due: date("DUE0"), // internal name as served by REST
 *   },
 * });
 * const item = await Tasks.getRecord(12);
 */
export class SharePointTable<TFields extends Record<string, FieldBase<any>>> {
    client: SharePointClient;
    listTitle: string;
    fields: TFields;
    primaryKey: { key: string };
    listItemEntityTypeFullName?: string;
    rootFolderUrl?: string;

    /**
     * The engine/queue-facing identity of this table — for SharePoint that is
     * the list title, matching the store name convention the generic sync
     * engine uses (see @dataverse-schema/sync SyncTable).
     */
    get entitySetName(): string {
        return this.listTitle;
    }

    constructor(options: SharePointTableOptions<TFields>) {
        this.client = options.client;
        this.listTitle = options.listTitle;
        this.fields = options.fields;
        this.primaryKey = { key: options.primaryKey ?? "id" };
        this.listItemEntityTypeFullName = options.listItemEntityTypeFullName;
        this.rootFolderUrl = options.rootFolderUrl;
    }

    /**
     * Wire REST item → transformed record: maps each declared field's wire
     * value through its transformer, and hoists `__metadata` as the library's
     * `$meta` conventions (`$etag`, `$type`, `$uri`). Wire properties that are
     * not declared fields are dropped — declare them (or use
     * `GenericProperties` style tables) when you need raw passthrough.
     */
    transformItemFromSharePoint(wire: any): any {
        if (!wire || typeof wire !== "object") return wire;
        const out: Record<string, unknown> = {};
        for (const [tsKey, field] of Object.entries(this.fields) as [string, FieldBase<any>][]) {
            if (field instanceof FileField) {
                // Doc-lib content: name/url come from two item properties
                // (FileLeafRef/FileRef), not from one field's wire value.
                out[tsKey] = this.fileRefFromWire(wire);
                continue;
            }
            out[tsKey] = field.fromSharePoint(wire[field.name]);
        }
        const meta = wire.__metadata as ItemMetadata | undefined;
        if (meta) {
            if (meta.etag != null) out["$etag"] = meta.etag;
            if (meta.type != null) out["$type"] = meta.type;
            if (meta.uri != null) out["$uri"] = meta.uri;
        }
        return out;
    }

    /** Transformed record partial → wire REST payload (without `__metadata`). */
    transformValueToSharePoint(value: Record<string, unknown>): Record<string, unknown> {
        const wire: Record<string, unknown> = {};
        for (const [tsKey, raw] of Object.entries(value)) {
            const field = (this.fields as Record<string, FieldBase<any>>)[tsKey];
            if (!field) continue; // unknown/$-keys (e.g. $etag) are metadata-only
            if (field instanceof FileField) continue; // content flows through afterSave, never the item body
            const fieldWithWrite = field as FieldBase<any>;
            wire[fieldWithWrite.writeName] = fieldWithWrite.toSharePoint(raw);
        }
        return wire;
    }

    /** Builds `{ name, url }` for the doc-lib field from the item wire (`FileLeafRef` + `FileRef`). */
    fileRefFromWire(wire: any): FileRef {
        const name = wire["FileLeafRef"] ?? wire["FileLeafRef0"];
        const serverRelative = wire["FileRef"];
        return {
            ...(name != null ? { name: String(name) } : {}),
            // FileRef is server-relative ("/sites/dev/...") — resolve against
            // the client's site URL so origin + path always agree.
            ...(serverRelative ? { url: new URL(String(serverRelative), this.client.options.url).href } : {}),
        };
    }

    /**
     * Builds the `__metadata` object for write bodies: content type + (when an
     * etag is known) the etag used for MERGE/DELETE optimistic checks.
     */
    async metadata(value: { $etag?: string; $type?: string }): Promise<{ type: string; etag?: string }> {
        const type = value.$type ?? (this.listItemEntityTypeFullName ?? (await this.getType()));
        const meta: { type: string; etag?: string } = { type };
        if (value.$etag) meta.etag = value.$etag;
        return meta;
    }

    /** List-item content type, resolved once (REST `ListItemEntityTypeFullName`) and cached. */
    async getType(): Promise<string> {
        if (this.listItemEntityTypeFullName) return this.listItemEntityTypeFullName;
        const info = await this.client.fetch(`Web/Lists/GetByTitle('${encodeURIComponent(this.listTitle)}')?$select=ListItemEntityTypeFullName`);
        const value = typeof info === "object" && info
            ? (info as any).ListItemEntityTypeFullName
            : undefined;
        if (typeof value !== "string" || !value) {
            throw new Error(`List "${this.listTitle}" did not return a ListItemEntityTypeFullName`);
        }
        return (this.listItemEntityTypeFullName = value);
    }

    /** Primary id of a transformed record (SyncTable.getPrimaryId). */
    getPrimaryId(value: Partial<InferRecord<TFields>> & { $type?: string }): ListItemId | undefined {
        const id = (value as any)?.[this.primaryKey.key];
        return id == null ? undefined : String(id);
    }

    // --- CRUD ---

    /**
     * Retrieves a single list item by id (numeric REST id).
     *
     * @example
     * const item = await Tasks.getRecord(12);
     */
    async getRecord(id: ListItemId | number, query?: string, options: GetRecordOptions = {}) {
        const wire = await this.client.getRecord(this.listTitle, id, {
            query,
            signal: options.signal,
        });
        return wire ? this.transformItemFromSharePoint(wire) : null;
    }

    /**
     * Retrieves and transforms list items via a raw OData v3 query string
     * (`$filter=Status eq 'Done'`). The fluent/typed filter tree joins via
     * `packages/core` later; for now the builder (`buildQuery`) is available.
     *
     * @example
     * const done = await Tasks.getRecords('$filter=IsDone eq true&$orderby=Title');
     */
    async getRecords(query?: string, options: QueryRequestOptions = {}) {
        return this.client.getRecords(this.listTitle, { query, signal: options.signal }).then((rows) => rows && rows.map((r) => this.transformItemFromSharePoint(r)));
    }

    /**
     * Creates a list item and returns the transformed created record
     * (including `$etag`). SharePoint v3 has no
     * `Prefer: return=representation`; the `__metadata.type` body (plus the
     * created item's own metadata) is returned in the POST response.
     *
     * Document libraries: when a `file` value carries `{ name, data }`, the
     * item is created by uploading the content (`Files/Add`) — the file *is*
     * the item — and any metadata fields are MERGEd onto the created item
     * afterwards (the table's afterSave hook, mirroring Dataverse's FileField).
     */
    async createRecord(value: Partial<InferRecord<TFields>> & { $type?: string }, options: QueryRequestOptions = {}) {
        const file = this.fileData(value as Record<string, unknown>);
        if (file) {
            // Document library: upload first — the file *is* the item.
            if (!file.ref.name) throw new Error(`document field "${file.key}" value requires { name, data } for upload`);
            const folder = await this.rootFolder();
            const added = await this.client.addFile(folder, file.ref.name, file.ref.data as Blob | ArrayBuffer, { signal: options.signal, overwrite: file.overwrite });
            const itemId = await this.fileIdFromAdd(added);
            // Metadata columns (everything but the file) go on via MERGE.
            const metadataValues = { ...(value as Record<string, unknown>) } as Record<string, unknown>;
            delete metadataValues[file.key];
            if (Object.keys(metadataValues).length > 0) {
                await this.client.mergeRecord(this.listTitle, itemId, {
                    __metadata: { type: await this.getType() },
                    ...this.transformValueToSharePoint(metadataValues),
                });
            }
            const wire = await this.client.getRecord(this.listTitle, itemId);
            // content already uploaded inline — no further afterSave pass
            return this.transformItemFromSharePoint(wire);
        }
        const wire = await this.client.postRecord(this.listTitle, {
            __metadata: { type: await this.getType() },
            ...this.transformValueToSharePoint(value as Record<string, unknown>),
        }, options);
        const record = this.transformItemFromSharePoint(wire);
        await this._afterSave({ table: this, client: this.client, recordId: this.getPrimaryId(record) }, value);
        return record;
    }

    /**
     * Partial-merges an existing item via `POST` + `X-HTTP-Method: MERGE`.
     * MERGE keeps properties the payload doesn't carry, so a full entity body
     * is not required. The `__metadata` block carries the list-item entity
     * type; an etag from `$etag` (table-transformed reads carry it) or
     * `options.ifMatch` drives the optimistic concurrency check.
     *
     * @example
     * await Tasks.updateRecord(12, { done: true }, { ifMatch: item["$etag"] });
     */
    async updateRecord(id: ListItemId | number, value: Partial<InferRecord<TFields>> & { $type?: string; $etag?: string }, options: UpsertRecordOptions = {}) {
        const metadata = await this.metadata(value);
        await this.client.mergeRecord(this.listTitle, id, {
            __metadata: metadata,
            ...this.transformValueToSharePoint(value as Record<string, unknown>),
        }, { ifMatch: options.ifMatch ?? value.$etag, signal: options.signal });
        await this._afterSave({ table: this, client: this.client, recordId: id }, value);
        // MERGE has no return representation; sync-engine etag bookkeeping
        // fetches freshness itself (see @dataverse-schema/sync).
    }

    /**
     * Deletes a list item. Without `ifMatch` SharePoint performs an
     * unconditional delete; the sync engine always passes the freshest etag.
     * For document libraries this removes the file together with the item —
     * content and item share one lifecycle there.
     */
    async deleteRecord(id: ListItemId | number, options: DeleteRecordOptions = {}): Promise<ListItemId> {
        return this.client.deleteRecord(this.listTitle, id, options);
    }

    /**
     * Downloads the content of a document-library item as a `Response` (raw).
     * Uses the record's FileRef (server-relative) via
     * `GetFileByServerRelativeUrl(...)/$value`.
     */
    async getDocumentContent(id: ListItemId | number, options?: RequestOptions): Promise<Response> {
        const record = await this.getRecord(id);
        const ref = (record as any)?.[this._documentFieldKey() ?? ""] as FileRef | undefined;
        if (!ref?.url) throw new Error(`Item ${id} has no file content (missing FileRef)`);
        const pathname = new URL(ref.url).pathname;
        return this.client.getFileContent(pathname, options);
    }

    // --- document/file plumbing (afterSave, mirroring the Dataverse File field) ---

    /** Key of the first FileField in the fields map, if any. */
    private _documentFieldKey(): string | undefined {
        for (const [k, f] of Object.entries(this.fields) as [string, FieldBase<any>][]) {
            if (f instanceof FileField) return k;
        }
        return undefined;
    }

    /** The FileRef to upload for this save, or null when nothing to upload. */
    private fileData(value: Record<string, unknown>): { key: string; ref: FileRef; overwrite: boolean } | null {
        const keyOrUndefined = this._documentFieldKey();
        if (!keyOrUndefined) return null;
        const ref = value[keyOrUndefined] as FileRef | undefined;
        if (!ref || ref.data == null) return null;
        if (typeof Blob !== "undefined" && ref.data instanceof Blob) return { key: keyOrUndefined, ref, overwrite: this.fileField().overwrite };
        if (ref.data instanceof ArrayBuffer || ref.data instanceof Uint8Array) return { key: keyOrUndefined, ref, overwrite: this.fileField().overwrite };
        return null;
    }

    private fileField(): FileField {
        const field = (this.fields as Record<string, FieldBase<any>>)[this._documentFieldKey()!];
        return field as FileField;
    }

    /**
     * Resolves the list item id behind an uploaded file. `Files/Add` carries
     * `ListItemAllFields` in the verbose response on current tenants; when a
     * template omits it, fall back to the explicit follow-up call
     * (`GetFileByServerRelativeUrl(...)/ListItemAllFields?$select=Id`).
     */
    private async fileIdFromAdd(added: any): Promise<number> {
        const nested = (added as any)?.ListItemAllFields?.Id ?? (added as any)?.ListItemAllFields?.ID;
        if (typeof nested === "number" && Number.isInteger(nested)) return nested;
        const url = (added as any)?.ServerRelativeUrl;
        if (typeof url !== "string" || !url) {
            throw new Error("Files/Add response carried neither ListItemAllFields.Id nor ServerRelativeUrl");
        }
        const byUrl = await this.client.fetch(`Web/GetFileByServerRelativeUrl('${encodeURIComponent(url)}')/ListItemAllFields?$select=Id`);
        const id = (byUrl as any)?.Id ?? (byUrl as any)?.d?.Id;
        if (typeof id !== "number" || !Number.isInteger(id)) {
            throw new Error("Uploaded file item id could not be resolved (ListItemAllFields missing)");
        }
        return id;
    }

    /** Document-library root folder (server-relative), resolved once and cached. */
    async rootFolder(): Promise<string> {
        this.#rootFolder ??= (async () =>
            this.rootFolderUrl ?? (await this.client.getRootFolder(this.listTitle)))();
        return this.#rootFolder;
    }

    /**
     * afterSave hook (mirrors the Dataverse table's `_afterSave` + FileField
     * `afterSave`): uploads content present in the saved value's document
     * field via `Files/Add` with `overwrite=true`. On update the file *name*
     * must match the item's existing `FileLeafRef` to replace its content —
     * a different name creates a new item file, SharePoint does not rename
     * through the flat surface.
     */
    private async _afterSave(ctx: TransformContext, value: Record<string, unknown>): Promise<void> {
        const file = this.fileData(value);
        // Only relevant for update (create path uploads inline via createWithContent flow above);
        // inserts with no content skip entirely.
        if (!file) return;
        const folder = ctx.rootFolder ?? (await this.rootFolder());
        if (!file.ref.name) {
            throw new Error(`document field "${file.key}" value requires { name, data } to overwrite content`);
        }
        await this.client.addFile(folder, file.ref.name, file.ref.data as Blob | ArrayBuffer, {
            overwrite: file.overwrite,
        });
    }

    /** Server-relative root folder of this list/library (cached promise). */
    #rootFolder: Promise<string> | undefined;

    /**
     * Entry point for the typed (proxy-based) query builder — the simpler
     * sibling of the Dataverse package's fluent OData builder.
     *
     * @example
     * const q = Documents.query()
     *     .select((f) => [f.id, f.title, f.status])
     *     .expand({ project: ["Id", "Title"] })
     *     .where((f) => f.status.eq("Draft"))
     *     .orderBy((f) => f.modified, "desc")
     *     .top(50)
     *     .build();
     */
    query(): SPQuery<TFields> {
        return spQuery(this);
    }

    /**
     * OData v3 query-string builder mirroring the OData `QueryBuilderOptions`
     * conventions used by the Dataverse library; `$expand` maps to v3's
     * `$expand` for lookup fields.
     */
    buildQuery(options: {
        select?: string[];
        filter?: string;
        expand?: string[] | string;
        orderBy?: Array<{ name: string; direction?: "asc" | "desc" }>;
        top?: number;
        skip?: number;
    }): string {
        const parts: string[] = [];
        if (options.select?.length) parts.push(`$select=${options.select.join(",")}`);
        if (options.filter) parts.push(`$filter=${options.filter}`);
        if (options.expand) parts.push(`$expand=${typeof options.expand === "string" ? options.expand : options.expand.join(",")}`);
        if (options.orderBy?.length) {
            parts.push(
                `$orderby=${options.orderBy
                    .map((o) => `${o.name} ${o.direction === "desc" ? "desc" : ""}`.trim())
                    .join(",")}`,
            );
        }
        if (options.top != null) parts.push(`$top=${options.top}`);
        if (options.skip != null) parts.push(`$skip=${options.skip}`);
        return parts.join("&");
    }
}
