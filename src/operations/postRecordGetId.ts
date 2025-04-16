import { DataverseRecord, GUID } from "../types";
import { tryFetch, globalConfig } from "../util";

/**
 * Creates a new record in the specified Dataverse entity set and returns the ID of the newly created record.
 *
 * @param entitySetName - The logical name of the entity set where the record will be created (e.g., 'accounts', 'contacts').
 * @param value - An object representing the data for the new record. The keys of this object should correspond to the schema names of the entity's attributes.
 * @returns A promise that resolves to the GUID (string) of the newly created record.
 *
 * @example
 * // Create a new account record with the name 'Contoso Ltd.'
 * const newAccount = { name: 'Contoso Ltd.' };
 * postRecordGetId('accounts', newAccount)
 * .then(accountId => console.log('New Account ID:', accountId))
 * .catch(error => console.error('Error creating account:', error));
 *
 * @example
 * // Create a new contact record with a first name, last name, and email address.
 * const newContact = { firstname: 'John', lastname: 'Doe', emailaddress1: 'john.doe@example.com' };
 * postRecordGetId('contacts', newContact)
 * .then(contactId => console.log('New Contact ID:', contactId))
 * .catch(error => console.error('Error creating contact:', error));
 */

export async function postRecordGetId(
  entitySetName: string,
  value: DataverseRecord
): Promise<GUID> {
  return tryFetch(`${globalConfig.url}/${entitySetName}`, {
    method: "POST",
    body: JSON.stringify(value),
  });
}
