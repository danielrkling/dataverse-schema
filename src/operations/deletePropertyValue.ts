import { DataverseKey } from "../types";
import { tryFetch, globalConfig } from "../util";

/**
 * Deletes the value of a single-valued property of an existing Dataverse record, setting it to null.
 * This operation is only applicable to properties that support null values.
 *
 * @param entitySetName - The logical name of the entity set where the record is located (e.g., 'accounts', 'contacts').
 * @param id - The unique identifier of the record to update.
 * @param propertyName - The name of the single-valued property to delete (e.g., 'description', 'address1_fax').
 * @returns A promise that resolves to the ID of the updated record upon successful deletion of the property value.
 *
 * @example
 * // Delete the value of the 'description' property of the account record with ID 'a1b2c3d4-e5f6-7890-1234-567890abcdef'.
 * deletePropertyValue('accounts', 'a1b2c3d4-e5f6-7890-1234-567890abcdef', 'description')
 * .then(updatedAccountId => console.log('Updated Account ID:', updatedAccountId))
 * .catch(error => console.error('Error deleting account description:', error));
 *
 * @example
 * // Delete the value of the 'address1_fax' property of the contact record with ID 'f9e8d7c6-b5a4-3210-fedc-ba9876543210'.
 * deletePropertyValue('contacts', 'f9e8d7c6-b5a4-3210-fedc-ba9876543210', 'address1_fax')
 * .then(updatedContactId => console.log('Updated Contact ID:', updatedContactId))
 * .catch(error => console.error('Error deleting contact fax:', error));
 */

export async function deletePropertyValue(
  entitySetName: string,
  id: DataverseKey,
  propertyName: string
): Promise<DataverseKey> {
  await tryFetch(
    `${globalConfig.url}/${entitySetName}(${id})/${propertyName}`,
    {
      method: "DELETE",
    }
  );
  return id;
}
