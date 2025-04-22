import { DataverseRecord, Primitive } from "./types";

export const Etag = Symbol("etag");

export type Config = {
  url?: string;
  headers: {
    "OData-MaxVersion"?: string;
    "OData-Version"?: string;
    "Content-Type"?: string;
    "If-None-Match"?: string;
    Accept?: string;
    Prefer?: string;
    MSCRMCallerID?: string;
    CallerObjectId?: string;
  };
};

export const globalConfig: Config = {
  url: `${location.origin}/api/data/v9.2`,
  headers: {
    "OData-MaxVersion": "4.0",
    "OData-Version": "4.0",
    "Content-Type": "application/json; charset=utf-8",
    "If-None-Match": "null",
    Accept: "application/json",
    MSCRMCallerID: localStorage.getItem("MSCRMCallerID") ?? "",
    CallerObjectId: localStorage.getItem("CallerObjectId") ?? "",
  },
};

/**
 * Sets the global configuration for the application, including the base URL and default headers.
 *
 * @param config The configuration object to set.  The headers are merged with the existing global headers.
 *
 * @example
 * // Set a new base URL:
 * setConfig({ url: "/newapi/data/v9.2" });
 *
 * // Add a custom header:
 * setConfig({ headers: { "X-Custom-Header": "MyValue" } });
 */
export function setConfig(config: Config) {
  globalConfig.headers = { ...globalConfig.headers, ...config.headers };
  if (config.url) globalConfig.url = config.url;
}

const parenthesesRegEx = /\(([^)]*)\)/g;
/**
 * Performs a fetch request and handles common response processing, including JSON parsing,
 * error handling, and special handling for 204 No Content responses.
 *
 * @param url The URL to fetch.
 * @param init Optional fetch options.
 * @returns A promise that resolves to the JSON data if the response is JSON,
 * the extracted entity ID from the OData-EntityId header for 204 responses,
 * the response text for non-JSON responses, or void if 204 and no entity ID.
 * @throws An error if the response status is not ok or if an error is present in the JSON data.
 *
 * @example
 * // Fetch JSON data:
 * tryFetch("/api/data/v9.2/accounts/12345")
 * .then(data => console.log(data))
 * .catch(error => console.error(error));
 *
 * // Fetch with custom headers:
 * tryFetch("/api/data/v9.2/accounts", {
 * headers: { "Prefer": "odata.include-annotations=*" }
 * })
 * .then(data => console.log(data))
 * .catch(error => console.error(error));
 */
export async function tryFetch(url: RequestInfo | URL, init?: RequestInit) {
  const response = await fetch(url, {
    ...init,
    headers: {
      ...globalConfig.headers,
      ...init?.headers,
    },
  });

  if (response.headers.get("Content-Type")?.includes("application/json")) {
    const data = await response.json();
    if (data.error) {
      if (data.error.code === "0x80060891") return null //Record not Found
      throw data.error;
    }
    return data;
  }

  if (!response.ok) {
    throw new Error(response.status + "-" + response.statusText);
  }
  //No Content
  if (response.status == 204) {
    const entityId = response.headers.get("OData-EntityId");
    if (entityId) return parenthesesRegEx.exec(entityId)?.[1];
    return;
  }

  return await response.text();
}

export async function fetchChoices(name: string): Promise<{ value: number; color: string; label: string; description: string; }[]>{
  return tryFetch(`${globalConfig.url}/GlobalOptionSetDefinitions(Name=${wrapString(name)})`).then(
    (v) => mapChoices(v)
  );
}

/**
 * Maps choice/picklist data from a Dataverse option set into a more usable format.
 *
 * @param data The raw choice/picklist data from Dataverse.
 * @returns An array of objects, where each object represents a choice option
 * and contains the properties: value, color, label, and description.
 *
 * @example
 * // Map choice data:
 * const rawData = {
 * Options: [
 * { Value: 1, Color: "red", Label: { UserLocalizedLabel: { Label: "Red" } }, Description: { UserLocalizedLabel: { Label: "The color red" } } },
 * { Value: 2, Color: "blue", Label: { UserLocalizedLabel: { Label: "Blue" } }, Description: { UserLocalizedLabel: { Label: "The color blue" } } },
 * ]
 * };
 * const mappedChoices = mapChoices(rawData);
 * // returns
 * // [
 * //   { value: 1, color: "red", label: "Red", description: "The color red" },
 * //   { value: 2, color: "blue", label: "Blue", description: "The color blue" }
 * // ]
 */
export function mapChoices(data: any) {
  return [...data.Options].map((option) => ({
    value: Number(option.Value),
    color: String(option.Color),
    label: String(option.Label.UserLocalizedLabel.Label),
    description: String(option.Description.UserLocalizedLabel.Label),
  }));
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
  let result = String.raw(raw, values);
  result = result.replace(/>\s*/g, ">"); // Replace "> " with ">"
  result = result.replace(/\s*</g, "<"); // Replace "< " with "<"
  return result;
}

export async function fetchXml(
  entitySetName: string,
  xml: string
): Promise<Record<string, Primitive>[]> {
  return tryFetch(`${globalConfig.url}/${entitySetName}?fetchXml=${xml}`).then(
    (v) => v.value
  );
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
export function toBase64(file: File) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => {
      const url = reader.result;
      const index = url?.toString().indexOf("base64") ?? 0;
      resolve(url?.slice(index + 7));
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

/**
 * Checks if a value is a non-empty string.
 *
 * @param value The value to check.
 * @returns `true` if the value is a string with a length greater than zero, otherwise `false`.
 *
 * @example
 * isNonEmptyString("hello"); // returns true
 * isNonEmptyString("");      // returns false
 * isNonEmptyString(123);     // returns false
 * isNonEmptyString(null);    // returns false
 */
export function isNonEmptyString(value: any): boolean {
  return typeof value === "string" && value.length > 0;
}


const rxGUID = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/
const rxDateOnly = /^\d{4}-\d{2}-\d{2}$/

/**
 * Wraps a value in single quotes if it's a string, otherwise converts it to a string.
 * This is used to properly format values in OData queries.
 *
 * @param value The value to wrap.
 * @returns The value wrapped in single quotes if it's a string, or its string representation otherwise.
 *
 * @example
 * wrapString("hello"); // returns "'hello'"
 * wrapString(123);     // returns "123"
 */
export function wrapString(value: any) {
  return (typeof value === "string" && !rxGUID.test(value) && !rxDateOnly.test(value)) ? `'${value}'` : String(value);
}

export function attachEtag<T>(v: T): T {
  if (v && typeof v === "object")
      //@ts-expect-error
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
