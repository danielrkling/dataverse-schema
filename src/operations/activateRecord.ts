import { DataverseKey } from "../types";
import { updatePropertyValue } from "./updatePropertyValue";

/**
 * Activates a record in the specified Dataverse entity set by setting its 'statecode' to 0.
 * Note that the actual attribute name for the state code might vary depending on the entity.
 * This function assumes the standard 'statecode' attribute with a value of 0 representing the active state.
 *
 * @param entitySetName - The logical name of the entity set where the record is located (e.g., 'accounts', 'contacts', 'opportunities').
 * @param id - The unique identifier of the record to activate.
 * @returns A promise that resolves to the ID of the activated record upon successful activation.
 *
 * @example
 * // Activate the account record with ID 'a1b2c3d4-e5f6-7890-1234-567890abcdef'.
 * activateRecord('accounts', 'a1b2c3d4-e5f6-7890-1234-567890abcdef')
 * .then(activatedAccountId => console.log('Activated Account ID:', activatedAccountId))
 * .catch(error => console.error('Error activating account:', error));
 *
 * @example
 * // Activate the opportunity record with ID 'f9e8d7c6-b5a4-3210-fedc-ba9876543210'.
 * activateRecord('opportunities', 'f9e8d7c6-b5a4-3210-fedc-ba9876543210')
 * .then(activatedOpportunityId => console.log('Activated Opportunity ID:', activatedOpportunityId))
 * .catch(error => console.error('Error activating opportunity:', error));
 */

export async function activateRecord(
  entitySetName: string,
  id: DataverseKey
): Promise<string> {
  return updatePropertyValue(entitySetName, id, "statecode", 0);
}
