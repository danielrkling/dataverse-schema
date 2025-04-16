import { DataverseKey, Primitive } from "../types";
import { tryFetch, globalConfig } from "../util";

/**
 * Retrieves the value of a single property of a Dataverse record.
 *
 * @param entitySetName - The logical name of the entity set (e.g., 'accounts', 'contacts').
 * @param id - The unique identifier of the record.
 * @param propertyName - The name of the property to retrieve (e.g., 'name', 'emailaddress1').
 * @returns  A promise that resolves to the primitive value of the requested property (e.g., string, number, boolean).
 * @example
 * // Retrieve the 'name' property of the account record with ID 'a1b2c3d4-e5f6-7890-1234-567890abcdef'
 * getPropertyValue('accounts', 'a1b2c3d4-e5f6-7890-1234-567890abcdef', 'name')
 * .then(accountName => console.log('Account Name:', accountName))
 * .catch(error => console.error('Error retrieving account name:', error));
 *
 * @example
 * // Retrieve the 'emailaddress1' property of the contact record with ID 'f9e8d7c6-b5a4-3210-fedc-ba9876543210'
 * getPropertyValue('contacts', 'f9e8d7c6-b5a4-3210-fedc-ba9876543210', 'emailaddress1')
 * .then(email => console.log('Contact Email:', email))
 * .catch(error => console.error('Error retrieving contact email:', error));
 */

export async function getPropertyValue(
  entitySetName: string,
  id: DataverseKey,
  propertyName: string
): Promise<Primitive> {
  return tryFetch(
    `${globalConfig.url}/${entitySetName}(${id})/${propertyName}`
  ).then((r) => r.value);
}
