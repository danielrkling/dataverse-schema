import { DataverseKey } from "../types";
import { globalConfig } from "../util";

/**
 * Constructs the URL to retrieve the raw value of a single property of a Dataverse record.
 * This is particularly useful for retrieving binary or other non-JSON formatted data.
 *
 * @param entitySetName - The logical name of the entity set (e.g., 'accounts', 'contacts').
 * @param id - The unique identifier of the record.
 * @param propertyName - The name of the property to retrieve the raw value of (e.g., 'entityimage', 'documentbody').
 * @returns The URL that can be used to fetch the raw property value.
 *
 * @example
 * // Get the URL to retrieve the raw value of the 'entityimage' property
 * // of the account record with ID 'a1b2c3d4-e5f6-7890-1234-567890abcdef'.
 * const imageUrl = getPropertyRawValueURL('accounts', 'a1b2c3d4-e5f6-7890-1234-567890abcdef', 'entityimage');
 * console.log('Image URL:', imageUrl);
 * // You can then use this URL with a fetch request to get the image data.
 *
 * @example
 * // Get the URL to retrieve the raw value of the 'documentbody' property
 * // of a custom entity record named 'mydocument' with ID 'fedcba98-7654-3210-0fed-cba987654321'.
 * const documentUrl = getPropertyRawValueURL('mydocument', 'fedcba98-7654-3210-0fed-cba987654321', 'documentbody');
 * console.log('Document URL:', documentUrl);
 */

export function getPropertyRawValueURL(
  entitySetName: string,
  id: DataverseKey,
  propertyName: string
): string {
  return `${globalConfig.url}/${entitySetName}(${id})/${propertyName}/$value`;
}
