import type { SharePointTable } from "./table";

export * from "./client";
export * from "./fields";
export * from "./table";
export * from "./query";
export * from "./types";
export * from "./provision";

// Compile-time check: SharePointTable structurally satisfies the offline sync
// engine's generic table contract (the same shape `dataverse-schema/sync`
// consumes), so the mutation queue works over SharePoint lists unchanged.
// Kept local on purpose — this package stays stand-alone (no shared core).
type SyncTableContract = {
  entitySetName: string;
  primaryKey: { key: string };
  fields: Record<string, unknown>;
  getPrimaryId(value: any): string | undefined;
  getRecord(id: string): Promise<any>;
  createRecord(value: any, options?: { signal?: AbortSignal; overriddenCreatedOn?: Date | string }): Promise<any>;
  updateRecord(id: string, value: any, options?: { signal?: AbortSignal; ifMatch?: string }): Promise<any>;
  deleteRecord(id: string, options?: { signal?: AbortSignal; ifMatch?: string }): Promise<any>;
};

type _satisfies = SharePointTable<Record<string, any>> extends SyncTableContract ? true : never;
const _check: _satisfies = true;
export const syncTableCompat = _check as true;
