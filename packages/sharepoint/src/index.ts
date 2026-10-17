export * from "./client";
export * from "./fields";
export * from "./table";
export * from "./query";
export * from "./types";
export * from "./provision";

// Compile-time check: SharePointTable structurally satisfies the sync
// engine's generic table contract, so dataverse-schema-sync's SyncEngine
// works over SharePoint lists unchanged.
import type { SyncTable } from "dataverse-schema-sync";
import type { SharePointTable } from "./table";
import type { GenericProperties } from "./types";

type _satisfies = SharePointTable<Record<string, any>> extends SyncTable ? true : never;
const _check: _satisfies = true;
export const syncTableCompat = _check as true;
