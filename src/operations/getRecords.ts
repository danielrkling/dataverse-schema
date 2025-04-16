import { DataverseRecord } from "../types";
import { tryFetch, globalConfig, Etag, attachEtag } from "../util";
import { getNextLink } from "./getNextLink";

/**
 * Retrieves multiple records from a Dataverse entity set.
 *
 * @param entitySetName - The logical name of the entity set (e.g., 'accounts', 'contacts').
 * @param [query] - An optional OData query string to filter, sort, select fields, and expand related entities (e.g., '$filter=startswith(name, \'A\')&$orderby=name desc&$select=name,address1_city&$expand=primarycontactid($select=fullname)').
 * @returns A promise that resolves to an array of Dataverse record objects.
 *
 * @example
 * // Retrieve all account records.
 * getRecords('accounts')
 * .then(accounts => console.log('Accounts:', accounts))
 * .catch(error => console.error('Error retrieving accounts:', error));
 *
 * @example
 * // Retrieve the name and city of all active account records, ordered by name.
 * getRecords('accounts', '$filter=statecode eq 0&$select=name,address1_city&$orderby=name')
 * .then(activeAccounts => console.log('Active Accounts:', activeAccounts))
 * .catch(error => console.error('Error retrieving active accounts:', error));
 */

export async function getRecords(
  entitySetName: string,
  query?: string
): Promise<DataverseRecord[]> {
  return tryFetch(`${globalConfig.url}/${entitySetName}?${query}`)
    .then(getNextLink)
    .then((v) => v.map(attachEtag));
}
