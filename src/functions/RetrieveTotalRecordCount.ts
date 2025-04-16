import { tryFetch, globalConfig } from "../util";

/**
 * Retrieves the total record count for a specific entity in the system.
 *
 * @param  logicalName - The logical name of the entity whose total record count is to be fetched.
 * @returns  A promise that resolves to the total record count for the specified entity.
 */

export async function RetrieveTotalRecordCount(
  logicalName: string
): Promise<number> {
  return tryFetch(
    `${globalConfig.url}/RetrieveTotalRecordCount(EntityNames=['${logicalName}'])`
  ).then((d) => d.Values[0]);
}
