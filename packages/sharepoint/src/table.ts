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

import { SharePointClient, type QueryRequestOptions, type GetRecordOptions, type UpsertRecordOptions, type DeleteRecordOptions } from "./client";
import { FieldBase, type InferRecord } from "./fields";
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
            wire[(field as FieldBase<any>).name] = field.toSharePoint(raw);
        }
        return wire;
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
     */
    async createRecord(value: Partial<InferRecord<TFields>> & { $type?: string }, options: QueryRequestOptions = {}) {
        const wire = await this.client.postRecord(this.listTitle, {
            __metadata: { type: await this.getType() },
            ...this.transformValueToSharePoint(value as Record<string, unknown>),
        }, options);
        return this.transformItemFromSharePoint(wire);
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
        if (options.ifMatch == null && "$etag" in value && value.$etag == null) {
            // An explicit `$etag: null` means "concurrency must fail" — sent
            // verbatim; a missing `$etag` means the caller opted out.
        }
        const metadata = await this.metadata(value);
        await this.client.mergeRecord(this.listTitle, id, {
            __metadata: metadata,
            ...this.transformValueToSharePoint(value as Record<string, unknown>),
        }, { ifMatch: options.ifMatch ?? value.$etag, signal: options.signal });
        // MERGE has no return representation; sync-engine etag bookkeeping
        // fetches freshness itself (see @dataverse-schema/sync).
    }

    /**
     * Deletes a list item. Without `ifMatch` SharePoint performs an
     * unconditional delete; the sync engine always passes the freshest etag.
     */
    async deleteRecord(id: ListItemId | number, options: DeleteRecordOptions = {}): Promise<ListItemId> {
        return this.client.deleteRecord(this.listTitle, id, options);
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
