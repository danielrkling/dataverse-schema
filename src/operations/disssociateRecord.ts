import { DataverseKey } from "../types";
import { tryFetch, globalConfig } from "../util";

/**
 * Dissociates (removes the association between) a child record from a parent record through a single-valued or collection-valued navigation property in Dataverse.
 *
 * @param entitySetName - The logical name of the parent entity set (e.g., 'accounts', 'opportunities').
 * @param parentId - The unique identifier of the parent record.
 * @param propertyName - The name of the navigation property on the parent entity that points to the child record(s) (e.g., 'primarycontactid', 'contact_customer_accounts').
 * @param [childId] - The unique identifier of the child record to dissociate. This is required for collection-valued navigation properties and optional (or should be omitted) for single-valued navigation properties to clear the reference.
 * @returns A promise that resolves to the ID of the dissociated child record (if provided) or the parent record ID if dissociating a single-valued property.
 *
 * @example
 * // Dissociate the primary contact from the account record with ID 'a1b2c3d4-e5f6-7890-1234-567890abcdef' (single-valued navigation property).
 * disssociateRecord('accounts', 'a1b2c3d4-e5f6-7890-1234-567890abcdef', 'primarycontactid')
 * .then(parentId => console.log('Dissociated from Account ID:', parentId))
 * .catch(error => console.error('Error dissociating primary contact:', error));
 *
 * @example
 * // Dissociate the contact record with ID 'f9e8d7c6-b5a4-3210-fedc-ba9876543210' from the account record with ID 'a1b2c3d4-e5f6-7890-1234-567890abcdef' (collection-valued navigation property).
 * disssociateRecord('accounts', 'a1b2c3d4-e5f6-7890-1234-567890abcdef', 'contact_customer_accounts', 'f9e8d7c6-b5a4-3210-fedc-ba9876543210')
 * .then(childId => console.log('Dissociated Contact ID:', childId))
 * .catch(error => console.error('Error dissociating contact:', error));
 */

export async function disssociateRecord(
  entitySetName: string,
  parentId: DataverseKey,
  propertyName: string,
  childId?: DataverseKey
): Promise<DataverseKey> {
  await tryFetch(
    `${globalConfig.url}/${entitySetName}(${parentId})/${propertyName}${childId ? `(${childId})` : ""}/$ref`,
    {
      method: "DELETE",
    }
  );
  return childId ?? parentId;
}
