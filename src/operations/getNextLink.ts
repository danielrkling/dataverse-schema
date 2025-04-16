import { DataverseRecord } from "../types";
import { tryFetch } from "../util";

/**
 * Recursively retrieves all records from a paginated Dataverse response using the `@odata.nextLink`.
 *
 * @param result - An object containing the current page of Dataverse records and an optional `@odata.nextLink` property for the next page.
 * @param result.value - An array of Dataverse record objects from the current page.
 * @param [result["@odata.nextLink"]] - An optional URL to the next page of records.
 * @returns A promise that resolves to a single array containing all retrieved Dataverse record objects across all pages.
 *
 * @example
 * // Assuming 'initialRecords' is the result of an initial call to getRecords.
 * getNextLink(initialRecords)
 * .then(allRecords => console.log('All Records:', allRecords))
 * .catch(error => console.error('Error retrieving all records:', error));
 */

export async function getNextLink(result: {
  "@odata.nextLink"?: string;
  value: DataverseRecord[];
}): Promise<DataverseRecord[]> {
  if (result["@odata.nextLink"]) {
    const r = await getNextLink(await tryFetch(result["@odata.nextLink"]));
    return [...result.value, ...r];
  }
  return result.value;
}
