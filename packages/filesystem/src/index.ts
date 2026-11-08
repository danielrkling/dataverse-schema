import type { FieldBase } from "./fields";
import type { FileSystemTable } from "./table";

export * from "./database";
export * from "./errors";
export * from "./fields";
export * from "./handles";
export * from "./retry";
export * from "./storage";
export * from "./table";
export * from "./types";
export * from "./watch";

// Compile-time check: FileSystemTable structurally satisfies the generic
// offline sync engine's table contract (the same shape `dataverse-schema/sync`
// consumes). Kept local on purpose — this package stays standalone.
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

type _satisfies = FileSystemTable<Record<string, FieldBase<any>>> extends SyncTableContract ? true : never;
const _check: _satisfies = true;
export const syncTableCompat = _check as true;
