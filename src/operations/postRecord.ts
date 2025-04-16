import { DataverseRecord } from "../types";
import { tryFetch, globalConfig } from "../util";

/**
 * Creates a new record in the specified Dataverse entity set and returns the newly created record with all its properties.
 *
 * @param entitySetName - The logical name of the entity set where the record will be created (e.g., 'accounts', 'contacts').
 * @param value - An object representing the data for the new record. The keys of this object should correspond to the schema names of the entity's attributes.
 * @param [query=""] - An optional OData query string to include additional information in the returned record (e.g., '$expand=primarycontactid($select=fullname)').
 * @returns A promise that resolves to the newly created Dataverse record object, including all its properties as requested by the `Prefer` header.
 *
 * @example
 * // Create a new account record with the name 'Fabrikam Inc.' and retrieve the complete record.
 * const newAccount = { name: 'Fabrikam Inc.' };
 * postRecord('accounts', newAccount)
 * .then(createdAccount => console.log('Created Account:', createdAccount))
 * .catch(error => console.error('Error creating account:', error));
 *
 * @example
 * // Create a new opportunity record with a topic and potential customer, and expand the potential customer's name in the returned record.
 * const newOpportunity = { topic: 'New Software License Sale', customerid_account: 'c7b6a5e4-f3d2-1a90-8765-43210fedcba9' };
 * postRecord('opportunities', newOpportunity, '$expand=customerid_account($select=name)')
 * .then(createdOpportunity => console.log('Created Opportunity:', createdOpportunity))
 * .catch(error => console.error('Error creating opportunity:', error));
 */

export async function postRecord(
  entitySetName: string,
  value: DataverseRecord,
  query: string = ""
): Promise<DataverseRecord> {
  return tryFetch(`${globalConfig.url}/${entitySetName}?${query}`, {
    method: "POST",
    headers: {
      Prefer: "return=representation",
    },
    body: JSON.stringify(value),
  });
}
