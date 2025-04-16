import { DataverseKey } from "../types";
import { associateRecord } from "./associateRecord";
import { disssociateRecord } from "./disssociateRecord";
import { getAssociatedRecords } from "./getAssociatedRecords";

/**
 * Associates a list of child records with a parent record through a collection-valued navigation property in Dataverse.
 * This function adds associations for child records that are not currently associated and removes associations for child records that are currently associated but not in the provided list.
 *
 * @param entitySetName - The logical name of the parent entity set (e.g., 'accounts').
 * @param parentId - The unique identifier of the parent record.
 * @param propertyName - The name of the collection-valued navigation property on the parent entity that points to the child entities (e.g., 'contact_customer_accounts').
 * @param childEntitySetName - The logical name of the child entity set (e.g., 'contacts').
 * @param childPrimaryKeyName - The primary key attribute name of the child entity (e.g., 'contactid').
 * @param childIds - An array of unique identifiers of the child records to associate with the parent record.
 * @returns A promise that resolves to the array of child IDs provided in the input.
 *
 * @example
 * // Associate a list of contact records with an account record.
 * const contactIdsToAssociate = ['f9e8d7c6-b5a4-3210-fedc-ba9876543210', '12345678-90ab-cdef-1234-567890abcdef'];
 * associateRecordToList('accounts', 'a1b2c3d4-e5f6-7890-1234-567890abcdef', 'contact_customer_accounts', 'contacts', 'contactid', contactIdsToAssociate)
 * .then(associatedContactIds => console.log('Associated Contact IDs:', associatedContactIds))
 * .catch(error => console.error('Error associating contacts:', error));
 */

export async function associateRecordToList(
  entitySetName: string,
  parentId: DataverseKey,
  propertyName: string,
  childEntitySetName: string,
  childPrimaryKeyName: string,
  childIds: DataverseKey[]
): Promise<DataverseKey[]> {
  const currentIds = (
    await getAssociatedRecords(
      entitySetName,
      parentId,
      propertyName,
      `$select=${childPrimaryKeyName}`
    )
  ).map((r) => r[childPrimaryKeyName]) as DataverseKey[];

  const promises = [];
  for (const id of childIds) {
    if (!currentIds.includes(id))
      promises.push(
        associateRecord(
          entitySetName,
          parentId,
          propertyName,
          childEntitySetName,
          id
        )
      );
  }
  for (const id of currentIds) {
    if (!childIds.includes(id))
      promises.push(
        disssociateRecord(entitySetName, parentId, propertyName, id)
      );
  }
  await Promise.all(promises);
  return childIds;
}
