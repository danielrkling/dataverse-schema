import { DataverseKey } from "../types";
import { tryFetch, globalConfig } from "../util";

/**
 * Deletes a record from the specified Dataverse entity set.
 *
 * @param entitySetName - The logical name of the entity set where the record will be deleted (e.g., 'accounts', 'contacts').
 * @param id - The unique identifier of the record to delete.
 * @returns A promise that resolves to the ID of the deleted record upon successful deletion.
 *
 * @example
 * // Delete the account record with ID 'a1b2c3d4-e5f6-7890-1234-567890abcdef'.
 * deleteRecord('accounts', 'a1b2c3d4-e5f6-7890-1234-567890abcdef')
 * .then(deletedAccountId => console.log('Deleted Account ID:', deletedAccountId))
 * .catch(error => console.error('Error deleting account:', error));
 *
 * @example
 * // Delete the contact record with ID 'f9e8d7c6-b5a4-3210-fedc-ba9876543210'.
 * deleteRecord('contacts', 'f9e8d7c6-b5a4-3210-fedc-ba9876543210')
 * .then(deletedContactId => console.log('Deleted Contact ID:', deletedContactId))
 * .catch(error => console.error('Error deleting contact:', error));
 */

export async function deleteRecord(
  entitySetName: string,
  id: DataverseKey
): Promise<DataverseKey> {
  await tryFetch(`${globalConfig.url}/${entitySetName}(${id})`, {
    method: "DELETE",
  });
  return id;
}
