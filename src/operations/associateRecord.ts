import { DataverseKey } from "../types";
import { tryFetch, globalConfig } from "../util";

/**
 * Associates an existing child record with a parent record through a single-valued navigation property in Dataverse.
 *
 * @param entitySetName - The logical name of the parent entity set (e.g., 'accounts').
 * @param parentId - The unique identifier of the parent record.
 * @param propertyName - The name of the single-valued navigation property on the parent entity that points to the child entity (e.g., 'primarycontactid', 'parentaccountid').
 * @param childEntitySetName - The logical name of the child entity set (e.g., 'contacts', 'accounts').
 * @param childId - The unique identifier of the child record to associate.
 * @returns A promise that resolves to the ID of the associated child record upon successful association.
 *
 * @example
 * // Associate the contact record with ID 'f9e8d7c6-b5a4-3210-fedc-ba9876543210' as the primary contact of the account record with ID 'a1b2c3d4-e5f6-7890-1234-567890abcdef'.
 * associateRecord('accounts', 'a1b2c3d4-e5f6-7890-1234-567890abcdef', 'primarycontactid', 'contacts', 'f9e8d7c6-b5a4-3210-fedc-ba9876543210')
 * .then(associatedContactId => console.log('Associated Contact ID:', associatedContactId))
 * .catch(error => console.error('Error associating contact:', error));
 *
 * @example
 * // Associate the account record with ID 'c7b6a5e4-f3d2-1a90-8765-43210fedcba9' as the parent account of the current account record with ID 'a1b2c3d4-e5f6-7890-1234-567890abcdef'.
 * associateRecord('accounts', 'a1b2c3d4-e5f6-7890-1234-567890abcdef', 'parentaccountid', 'accounts', 'c7b6a5e4-f3d2-1a90-8765-43210fedcba9')
 * .then(associatedAccountId => console.log('Associated Account ID:', associatedAccountId))
 * .catch(error => console.error('Error associating account:', error));
 */

export async function associateRecord(
  entitySetName: string,
  parentId: DataverseKey,
  propertyName: string,
  childEntitySetName: string,
  childId: DataverseKey
): Promise<DataverseKey> {
  await tryFetch(
    `${globalConfig.url}/${entitySetName}(${parentId})/${propertyName}/$ref`,
    {
      method: "PUT",
      body: JSON.stringify({
        "@odata.id": `${globalConfig.url}/${childEntitySetName}(${childId})`,
      }),
    }
  );
  return childId;
}
