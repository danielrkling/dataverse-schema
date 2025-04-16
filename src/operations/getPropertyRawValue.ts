import { DataverseKey } from "../types";
import { tryFetch } from "../util";
import { getPropertyRawValueURL } from "./getPropertyRawValueURL";

/**
 * Retrieves the raw value of a single property of a Dataverse record.
 * This is particularly useful for retrieving binary or other non-JSON formatted data.
 *
 * @param entitySetName - The logical name of the entity set (e.g., 'accounts', 'contacts').
 * @param id - The unique identifier of the record.
 * @param propertyName - The name of the property to retrieve the raw value of (e.g., 'entityimage', 'documentbody').
 * @returns A promise that resolves to the raw value of the property as a string.
 *
 * @example
 * // Retrieve the raw value (as a string) of the 'entityimage' property
 * // of the account record with ID 'a1b2c3d4-e5f6-7890-1234-567890abcdef'.
 * getPropertyRawValue('accounts', 'a1b2c3d4-e5f6-7890-1234-567890abcdef', 'entityimage')
 * .then(imageData => {
 * console.log('Raw Image Data (String):', imageData);
 * // You might need to further process this string depending on the actual data type.
 * })
 * .catch(error => console.error('Error retrieving raw image:', error));
 *
 * @example
 * // Retrieve the raw value (as a string) of the 'documentbody' property
 * // of a custom entity record named 'mydocument' with ID 'fedcba98-7654-3210-0fed-cba987654321'.
 * getPropertyRawValue('mydocument', 'fedcba98-7654-3210-0fed-cba987654321', 'documentbody')
 * .then(documentData => {
 * console.log('Raw Document Data (String):', documentData);
 * // You might need to decode this string (e.g., from Base64) to get the actual document content.
 * })
 * .catch(error => console.error('Error retrieving raw document:', error));
 */

export async function getPropertyRawValue(
  entitySetName: string,
  id: DataverseKey,
  propertyName: string
): Promise<string> {
  return tryFetch(getPropertyRawValueURL(entitySetName, id, propertyName));
}
