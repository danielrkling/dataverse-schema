import { SyncEngine, type SyncEngineOptions } from "./engine";
import { type DataverseTable } from "../table";
import { type GenericProperties } from "../types";
import { getEtag } from "../util";
import { isDeterministicFailure } from "./error-codes";

/**
 * Dataverse-specific construction of the generic {@link SyncEngine}: injects
 * the etag reader (`$etag` via `getEtag`), the deterministic-failure
 * classifier (Dataverse error-code table) and the table set, so the
 * product-agnostic engine needs no Dataverse knowledge.
 * `DataverseTable` satisfies `SyncTable` structurally.
 */
export function dataverseSyncEngine(options: Omit<SyncEngineOptions, "getEtag" | "isDeterministicFailure" | "tables"> & {
    tables: DataverseTable<GenericProperties>[];
}): SyncEngine {
    const { tables, ...rest } = options;
    return new SyncEngine({
        ...rest,
        tables,
        getEtag,
        isDeterministicFailure: isDeterministicFailure as (error: unknown) => boolean,
    });
}
