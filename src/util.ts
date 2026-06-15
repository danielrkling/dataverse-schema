import { DataverseClient } from "./client";
import { DataverseRecord, Primitive } from "./types";

export const Etag = Symbol("etag");

export function attachEtag<T>(v: T): T {
  if (v && typeof v === "object")
  v[Etag] = v["@odata.etag"];
  return v;
}

/**
 * Retains references to previous recrods if ETag value is unchanged
 * 
 * @param prevRecords 
 * @param newRecords 
 * @returns 
 */
export function mergeRecords<T>(prevRecords: T[], newRecords: T[]): T[] {
  const prevMap = new Map(prevRecords.map((v) => [(v as any)[Etag], v]));
  return newRecords.map((v) => prevMap.get((v as any)[Etag]) ?? v);
}


/**
 * Creates an XML string from a template string array, removing unnecessary whitespace.
 *
 * @param raw The template string array.
 * @param values The values to interpolate into the template string.
 * @returns A compact XML string.
 *
 * @example
 * // Create a simple XML string:
 * const myXml = xml`
 * <root>
 * <element>Hello</element>
 * </root>
 * `;
 * // returns "<root><element>Hello</element></root>"
 */
export function xml(raw: TemplateStringsArray, ...values: unknown[]) {
  return String.raw(raw, values).trim().replace(/>\s+</g, '><');
}


/**
 * Converts a File object to a base64 encoded string.
 *
 * @param file The File object to convert.
 * @returns A promise that resolves to the base64 encoded string, or rejects with an error.
 *
 * @example
 * // Convert a file to base64:
 * const myFile = document.getElementById('myFile').files[0];
 * toBase64(myFile)
 * .then(base64String => console.log(base64String))
 * .catch(error => console.error(error));
 */
export function toBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => {
      const url = reader.result;
      const index = url?.toString().indexOf("base64") ?? 0;
      resolve(url?.slice(index + 7) as string);
    };
    reader.onerror = reject;
  });
}

/**
 * Creates a data URL from a base64 encoded image string.
 *
 * @param base64 The base64 encoded image string.
 * @returns A data URL representing the image.
 *
 * @example
 * // Create a data URL from a base64 string:
 * const base64String = "iVBORw0KGgoAAAANSUhEUg..."; // A long base64 string
 * const imageUrl = base64ImageToURL(base64String);
 * // returns "data:image/png;base64,iVBORw0KGgoAAAANSUhEUg..."
 */
export function base64ImageToURL(base64: string) {
  return `data:${detectImageType(base64)};base64,${base64}`;
}

/**
 * Detects the image type from a base64 encoded string.
 *
 * @param base64 The base64 encoded image string.
 * @returns The image type (e.g., "image/png", "image/jpeg", "image/gif").  Defaults to "image/png" if type is unknown.
 *
 * @example
 * const pngBase64 = "iVBORw0KGgoAAAANSUhEUgAA...";
 * detectImageType(pngBase64); // returns "image/png"
 *
 * const jpgBase64 = "/9j/4AAQSkZJRgABAQEAYABgAAD/";
 * detectImageType(jpgBase64); // returns "image/jpeg"
 */
function detectImageType(base64: string): string {
  if (base64.startsWith("iVBORw0KGgoAAAANSUhEUgAA")) {
    return "image/png";
  } else if (base64.startsWith("/9j/4AAQSkZJRgABAQEAYABgAAD/")) {
    return "image/jpeg";
  } else if (base64.startsWith("R0lGODlh")) {
    return "image/gif";
  } else {
    return "image/png";
  }
}

/**
 * Constructs a URL to retrieve an image from Dataverse.
 *
 * @param entity The logical name of the entity the image belongs to.
 * @param name The name of the image attribute.
 * @param id The ID of the entity record.
 * @returns A URL string to download the image.
 *
 * @example
 * // Get the URL for a contact's profile image:
 * const imageUrl = getImageUrl("contact", "entityimage", "12345");
 * // returns "/Image/download.aspx?Entity=contact&Attribute=entityimage&Id=12345&Full=true"
 */
export function getImageUrl(entity: string, name: string, id: string): string {
  return `${location.origin}/Image/download.aspx?Entity=${entity}&Attribute=${name}&Id=${id}&Full=true`;
}


export function parseDateOnly(dateString: string): Date {
  const [year, month, day] = dateString.slice(0, 10).split("-").map(Number);
  return new Date(year ?? 0, (month ?? 0) - 1, day);
}

export function toDateOnly(date: Date) {
  try {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0"); // Months are zero-indexed
    const day = String(date.getDate()).padStart(2, "0");

    return `${year}-${month}-${day}`;
  } catch (e) {
    return null;
  }
}
/** A field name can be a string or an object with a name property. */
export type Name = string | { name: string; };
/** Extracts the string name from a FieldName type. */

export function getName(name: Name): string {
  return typeof name === "string" ? name : name.name;
}

