import { DataverseKey, DataverseRecord } from "../types";
import { tryFetch, globalConfig } from "../util";

/**
 * Updates an existing record in the specified Dataverse entity set and returns the updated record with all its properties.
 *
 * @param entitySetName - The logical name of the entity set where the record will be updated (e.g., 'accounts', 'contacts').
 * @param id - The unique identifier of the record to update.
 * @param value - An object representing the data to update for the record. The keys of this object should correspond to the schema names of the entity's attributes that need to be modified.
 * @param [query=""] - An optional OData query string to include additional information in the returned updated record (e.g., '$expand=primarycontactid($select=fullname)').
 * @returns A promise that resolves to the updated Dataverse record object, including all its properties as requested by the `Prefer` header.
 *
 * @example
 * // Update the 'name' and 'address1_city' of the account record with ID 'a1b2c3d4-e5f6-7890-1234-567890abcdef'
 * const updatedAccountData = { name: 'Updated Contoso Ltd.', address1_city: 'Redmond' };
 * patchRecord('accounts', 'a1b2c3d4-e5f6-7890-1234-567890abcdef', updatedAccountData)
 * .then(updatedAccount => console.log('Updated Account:', updatedAccount))
 * .catch(error => console.error('Error updating account:', error));
 *
 * @example
 * // Update the 'jobtitle' of the contact record with ID 'f9e8d7c6-b5a4-3210-fedc-ba9876543210' and expand their parent account's name.
 * const updatedContactData = { jobtitle: 'Marketing Manager' };
 * patchRecord('contacts', 'f9e8d7c6-b5a4-3210-fedc-ba9876543210', updatedContactData, '$expand=parentcustomerid($select=name)')
 * .then(updatedContact => console.log('Updated Contact:', updatedContact))
 * .catch(error => console.error('Error updating contact:', error));
 */

export async function patchRecord(
  entitySetName: string,
  id: DataverseKey,
  value: DataverseRecord,
  query: string = ""
): Promise<DataverseRecord> {
  return tryFetch(`${globalConfig.url}/${entitySetName}(${id})?${query}`, {
    method: "PATCH",
    headers: {
      Prefer: "return=representation",
    },
    body: JSON.stringify(value),
  });
}
