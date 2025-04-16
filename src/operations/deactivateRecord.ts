import { DataverseKey } from "../types";
import { updatePropertyValue } from "./updatePropertyValue";

/**
 * Deactivates a record in the specified Dataverse entity set by setting its 'statecode' to 1.
 * Note that the actual attribute name for the state code and the value for the inactive state might vary depending on the entity.
 * This function assumes the standard 'statecode' attribute with a value of 1 representing the inactive state.
 *
 * @param entitySetName - The logical name of the entity set where the record is located (e.g., 'accounts', 'contacts', 'opportunities').
 * @param id - The unique identifier of the record to deactivate.
 * @returns A promise that resolves to the ID of the deactivated record upon successful deactivation.
 *
 * @example
 * // Deactivate the account record with ID 'a1b2c3d4-e5f6-7890-1234-567890abcdef'.
 * deactivateRecord('accounts', 'a1b2c3d4-e5f6-7890-1234-567890abcdef')
 * .then(deactivatedAccountId => console.log('Deactivated Account ID:', deactivatedAccountId))
 * .catch(error => console.error('Error deactivating account:', error));
 *
 * @example
 * // Deactivate the opportunity record with ID 'f9e8d7c6-b5a4-3210-fedc-ba9876543210'.
 * deactivateRecord('opportunities', 'f9e8d7c6-b5a4-3210-fedc-ba9876543210')
 * .then(deactivatedOpportunityId => console.log('Deactivated Opportunity ID:', deactivatedOpportunityId))
 * .catch(error => console.error('Error deactivating opportunity:', error));
 */

export async function deactivateRecord(
  entitySetName: string,
  id: DataverseKey
): Promise<string> {
  return updatePropertyValue(entitySetName, id, "statecode", 1);
}
