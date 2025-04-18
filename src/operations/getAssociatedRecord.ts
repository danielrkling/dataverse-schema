import { DataverseKey, DataverseRecord } from "../types";
import { tryFetch, globalConfig, attachEtag } from "../util";

/**
 * Retrieves a single associated record from a navigation property of a Dataverse record.
 *
 * @param entitySetName - The logical name of the primary entity set (e.g., 'accounts').
 * @param id - The unique identifier of the primary record.
 * @param navigationPropertyName - The name of the navigation property to the related record (e.g., 'primarycontactid', 'parentaccountid').
 * @param [query] - An optional OData query string to select fields or expand further related entities of the associated record (e.g., '$select=fullname,emailaddress1').
 * @returns A promise that resolves to the retrieved associated Dataverse record object.
 *
 * @example
 * // Retrieve the primary contact of the account record with ID 'a1b2c3d4-e5f6-7890-1234-567890abcdef',
 * // selecting their full name and email address.
 * getAssociatedRecord('accounts', 'a1b2c3d4-e5f6-7890-1234-567890abcdef', 'primarycontactid', '$select=fullname,emailaddress1')
 * .then(contact => console.log('Primary Contact:', contact))
 * .catch(error => console.error('Error retrieving primary contact:', error));
 *
 * @example
 * // Retrieve the parent account of the contact record with ID 'f9e8d7c6-b5a4-3210-fedc-ba9876543210',
 * // selecting only the account name.
 * getAssociatedRecord('contacts', 'f9e8d7c6-b5a4-3210-fedc-ba9876543210', 'parentaccountid', '$select=name')
 * .then(parentAccount => console.log('Parent Account:', parentAccount))
 * .catch(error => console.error('Error retrieving parent account:', error));
 */

export async function getAssociatedRecord(
  entitySetName: string,
  id: DataverseKey,
  navigationPropertyName: string,
  query?: string
): Promise<DataverseRecord|null> {
  return tryFetch(
    `${globalConfig.url}/${entitySetName}(${id})/${navigationPropertyName}?${query}`
  ).then(attachEtag);
}
