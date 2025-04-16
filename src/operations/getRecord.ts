import { DataverseKey, DataverseRecord } from "../types";
import { tryFetch, globalConfig, attachEtag } from "../util";

/**
 * Retrieves a single record from a Dataverse entity set.
 *
 * @param entitySetName - The logical name of the entity set (e.g., 'accounts', 'contacts').
 * @param id - The unique identifier of the record to retrieve. This could be a string GUID.
 * @param query An optional OData query string to filter or expand related entities (e.g., '$select=name,address1_city&$expand=primarycontactid($select=fullname)').
 * @returns A promise that resolves to the retrieved Dataverse record object.
 *
 * @example
 * // Retrieve the account record with ID 'a1b2c3d4-e5f6-7890-1234-567890abcdef'
 * getRecord('accounts', 'a1b2c3d4-e5f6-7890-1234-567890abcdef')
 * .then(account => console.log(account))
 * .catch(error => console.error('Error retrieving account:', error));
 *
 * @example
 * // Retrieve the name and city of the account record with the specified ID,
 * // and also expand the primary contact's full name.
 * getRecord('accounts', 'a1b2c3d4-e5f6-7890-1234-567890abcdef', '$select=name,address1_city&$expand=primarycontactid($select=fullname)')
 * .then(account => console.log(account))
 * .catch(error => console.error('Error retrieving account with query:', error));
 */

export async function getRecord(
  entitySetName: string,
  id: DataverseKey,
  query?: string
): Promise<DataverseRecord> {
  return tryFetch(`${globalConfig.url}/${entitySetName}(${id})?${query}`).then(attachEtag);
}
