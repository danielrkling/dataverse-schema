export declare const Etag = "$etag";
export declare function isNonEmptyString(value: unknown): value is string;
export declare function wrapString(value: unknown): string;
export type ExpandValue = string | {
    select?: (Name)[];
    expand?: ExpandObject;
    filter?: string;
    orderby?: {
        [key: string]: "asc" | "desc";
    };
};
export interface ExpandObject {
    [key: string]: ExpandValue;
}
export declare function select(...values: (Name)[]): string;
export declare function orderby(values: {
    [key: string]: "asc" | "desc";
} | string[]): string;
export declare class OrderSpec {
    readonly fields: string[];
    readonly direction: "asc" | "desc";
    constructor(fields: string[], direction: "asc" | "desc");
    toString(): string;
}
export declare function asc(...fields: Name[]): OrderSpec;
export declare function desc(...fields: Name[]): OrderSpec;
export declare function keys(keyValues: {
    [key: string]: string | number;
}): string;
export declare function expand(values: string | ExpandObject): string;
export declare function attachEtag<T>(v: T): T;
export declare function getEtag(v: any): string | undefined;
/**
 * Retains references to previous recrods if ETag value is unchanged
 *
 * @param prevRecords
 * @param newRecords
 * @returns
 */
export declare function mergeRecords<T>(prevRecords: T[], newRecords: T[]): T[];
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
export declare function xml(raw: TemplateStringsArray, ...values: unknown[]): string;
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
export declare function toBase64(file: File): Promise<string>;
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
export declare function base64ImageToURL(base64: string): string;
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
export declare function getImageUrl(entity: string, name: string, id: string): string;
export declare function parseDateOnly(dateString: string): Date;
export declare function toDateOnly(date: Date): string | null;
/** A field name can be a string or an object with a name or toString method. */
export type Name = string | {
    name: string;
} | {
    toString(): string;
};
/** Extracts the string name from a FieldName type. */
export declare function getName(name: Name): string;
