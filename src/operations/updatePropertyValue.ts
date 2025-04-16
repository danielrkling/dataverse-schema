import { DataverseKey, Primitive } from "../types";
import { tryFetch, globalConfig } from "../util";

/**
 * Updates the value of a single property of an existing Dataverse record.
 *
 * @param entitySetName - The logical name of the entity set where the record is located (e.g., 'accounts', 'contacts').
 * @param id - The unique identifier of the record to update.
 * @param propertyName - The name of the property to update (e.g., 'name', 'emailaddress1').
 * @param value - The new primitive value for the property (e.g., a string, number, or boolean).
 * @returns A promise that resolves to the ID of the updated record upon successful update.
 *
 * @example
 * // Update the 'name' property of the account record with ID 'a1b2c3d4-e5f6-7890-1234-567890abcdef' to 'New Account Name'.
 * updatePropertyValue('accounts', 'a1b2c3d4-e5f6-7890-1234-567890abcdef', 'name', 'New Account Name')
 * .then(updatedAccountId => console.log('Updated Account ID:', updatedAccountId))
 * .catch(error => console.error('Error updating account name:', error));
 *
 * @example
 * // Update the 'emailaddress1' property of the contact record with ID 'f9e8d7c6-b5a4-3210-fedc-ba9876543210' to 'updated.email@example.com'.
 * updatePropertyValue('contacts', 'f9e8d7c6-b5a4-3210-fedc-ba9876543210', 'emailaddress1', 'updated.email@example.com')
 * .then(updatedContactId => console.log('Updated Contact ID:', updatedContactId))
 * .catch(error => console.error('Error updating contact email:', error));
 */

export async function updatePropertyValue(
  entitySetName: string,
  id: DataverseKey,
  propertyName: string,
  value: Primitive
): Promise<DataverseKey> {
  await tryFetch(
    `${globalConfig.url}/${entitySetName}(${id})/${propertyName}`,
    {
      method: "PUT",
      body: JSON.stringify({ value }),
    }
  );
  return id;
}
