import { DataverseKey, DataverseRecord } from "../types";
import { tryFetch, globalConfig, attachEtag } from "../util";

/**
 * Retrieves multiple associated records from a navigation property of a Dataverse record.
 *
 * @param entitySetName - The logical name of the primary entity set (e.g., 'accounts').
 * @param id - The unique identifier of the primary record.
 * @param navigationPropertyName - The name of the collection-valued navigation property to the related records (e.g., 'contact_customer_accounts', 'opportunity_customer_contacts').
 * @param [query=""] - An optional OData query string to filter, sort, select fields, and expand further related entities of the associated records (e.g., '$filter=startswith(fullname, \'B\')&$select=fullname,emailaddress1').
 * @returns A promise that resolves to an array of associated Dataverse record objects.
 *
 * @example
 * // Retrieve all contacts associated with the account record with ID 'a1b2c3d4-e5f6-7890-1234-567890abcdef'.
 * getAssociatedRecords('accounts', 'a1b2c3d4-e5f6-7890-1234-567890abcdef', 'contact_customer_accounts')
 * .then(contacts => console.log('Associated Contacts:', contacts))
 * .catch(error => console.error('Error retrieving associated contacts:', error));
 *
 * @example
 * // Retrieve the full name and email address of all active contacts associated with the account record
 * // with ID 'a1b2c3d4-e5f6-7890-1234-567890abcdef', ordered by full name.
 * getAssociatedRecords('accounts', 'a1b2c3d4-e5f6-7890-1234-567890abcdef', 'contact_customer_accounts', '$filter=statecode eq 0&$select=fullname,emailaddress1&$orderby=fullname')
 * .then(activeContacts => console.log('Active Associated Contacts:', activeContacts))
 * .catch(error => console.error('Error retrieving active associated contacts:', error));
 */

export async function getAssociatedRecords(
  entitySetName: string,
  id: DataverseKey,
  navigationPropertyName: string,
  query: string = ""
): Promise<DataverseRecord[]> {
  return tryFetch(
    `${globalConfig.url}/${entitySetName}(${id})/${navigationPropertyName}?${query}`
  ).then((r) => r.value.map(attachEtag));
}
