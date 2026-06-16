/**
 * Creates a validator function that checks if a value is required (not null or undefined).
 *
 * @returns A validator function that returns "Required" if the value is null or undefined, otherwise undefined.
 *
 * @example
 * // Create a required validator:
 * const isRequired = required();
 *
 * // Validate a value:
 * isRequired("hello"); // returns undefined (valid)
 * isRequired(null);    // returns "Required" (invalid)
 * isRequired(undefined); // returns "Required" (invalid)
 */

import { Validator } from "./types";

export function required() {
  return (v: any) => {
    if (v === null || v === undefined) return "Required";
  };
} /**
 * Creates a validator function that checks if a string matches a regular expression.
 *
 * @param regex The regular expression to test against.
 * @param message An optional custom error message.  Defaults to "Invalid format".
 * @returns A validator function that returns an error message if the string does not match the regex, otherwise undefined.
 *
 * @example
 * // Create a pattern validator for US phone numbers:
 * const phonePattern = pattern(/^\d{3}-\d{3}-\d{4}$/, "Invalid phone number format (e.g., 123-456-7890)");
 *
 * // Validate a phone number:
 * phonePattern("123-456-7890"); // returns undefined (valid)
 * phonePattern("1234567890");   // returns "Invalid phone number format (e.g., 123-456-7890)" (invalid)
 * phonePattern("abc-def-ghij");   // returns "Invalid phone number format (e.g., 123-456-7890)" (invalid)
 */

export function pattern(regex: RegExp, message?: string): Validator<string> {
  return (v: string) => {
    if (v && !regex.test(v)) {
      return message || "Invalid format";
    }
  };
}
/**
 * Creates a validator function that checks if a value is a number. It can validate both numbers and strings.
 *
 * @returns A validator function that returns "Must be a number" if the value is not a number, otherwise undefined.
 *
 * @example
 * // Create a numeric validator:
 * const isNumeric = numeric();
 *
 * // Validate a number:
 * isNumeric(10);     // returns undefined (valid)
 * isNumeric(10.5);   // returns undefined (valid)
 *
 * // Validate a string:
 * isNumeric("10");   // returns undefined (valid)
 * isNumeric("10.5"); // returns undefined (valid)
 * isNumeric("abc");  // returns "Must be a number" (invalid)
 */

export function numeric(): Validator<number | string> {
  return (v: number | string) => {
    if (v !== undefined && v !== null) {
      const num = Number(v);
      if (isNaN(num)) {
        return "Must be a number";
      }
    }
  };
}
/**
 * Creates a validator function that checks if a number is greater than or equal to a minimum value.
 *
 * @param min The minimum value.
 * @returns A validator function that returns an error message if the number is less than the minimum, otherwise undefined.
 *
 * @example
 * // Create a minValue validator:
 * const minAge18 = minValue(18);
 *
 * // Validate an age:
 * minAge18(21); // returns undefined (valid)
 * minAge18(15); // returns "Must be at least 18" (invalid)
 */

export function minValue(min: number): Validator<number> {
  return (v: number) => {
    if (typeof v === "number" && v < min) {
      return `Must be at least ${min}`;
    }
  };
}
/**
 * Creates a validator function that checks if the length of a value is greater than or equal to a minimum length.
 *
 * @param min The minimum length.
 * @returns A validator function that returns an error message if the length is less than the minimum, otherwise undefined.
 *
 * @example
 * // Create a minLength validator:
 * const minLength5 = minLength(5);
 *
 * // Validate a string:
 * minLength5("hello");       // returns undefined (valid)
 * minLength5("hi");          // returns "Length less than 5" (invalid)
 *
 * // Validate an array:
 * minLength5([1, 2, 3, 4, 5]); // returns undefined (valid)
 * minLength5([1, 2, 3]);       // returns "Length less than 5" (invalid)
 */

export function minLength(min: number) {
  return (v: { length: number }) => {
    if (v.length < min) return `Length less than ${min}`;
  };
}
/**
 * Creates a validator function that checks if a number is less than or equal to a maximum value.
 *
 * @param max The maximum value.
 * @returns A validator function that returns an error message if the number is greater than the maximum, otherwise undefined.
 *
 * @example
 * // Create a maxValue validator:
 * const maxAge65 = maxValue(65);
 *
 * // Validate an age:
 * maxAge65(40); // returns undefined (valid)
 * maxAge65(70); // returns "Must be no more than 65" (invalid)
 */

export function maxValue(max: number): Validator<number> {
  return (v: number) => {
    if (typeof v === "number" && v > max) {
      return `Must be no more than ${max}`;
    }
  };
}
/**
 * Creates a validator function that checks if the length of a value is less than or equal to a maximum length.
 *
 * @param max The maximum length.
 * @returns A validator function that returns an error message if the length is greater than the maximum, otherwise undefined.
 *
 * @example
 * // Create a maxLength validator:
 * const maxLength10 = maxLength(10);
 *
 * // Validate a string:
 * maxLength10("hello");         // returns undefined (valid)
 * maxLength10("hello world!"); // returns "Length more than 10" (invalid)
 *
 * // Validate an array:
 * maxLength10([1, 2, 3, 4, 5]);   // returns undefined (valid)
 * maxLength10([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]); // returns "Length more than 10" (invalid)
 */

export function maxLength(max: number) {
  return (v: { length: number }) => {
    if (v.length > max) return `Length more than ${max}`;
  };
}
export function isTypeOrNull(type: Types): Validator<any> {
  return (v: any) => {
    if (v === null) return;
    if (typeof v !== type) {
      return "Not of type " + type;
    }
  };
}
export type Types =
  | "string"
  | "number"
  | "bigint"
  | "boolean"
  | "symbol"
  | "undefined"
  | "object"
  | "function";
export function isType(type: Types): Validator<any> {
  return (v: any) => {
    if (typeof v !== type) {
      return "Not of type " + type;
    }
  };
}

/**
 * Creates a validator function that checks if a value is an integer.  It can validate both numbers and strings.
 *
 * @returns A validator function that returns "Must be an integer" if the value is not an integer, otherwise undefined.
 *
 * @example
 * // Create an integer validator:
 * const isInteger = integer();
 *
 * // Validate a number:
 * isInteger(10);     // returns undefined (valid)
 * isInteger(10.5);   // returns "Must be an integer" (invalid)
 *
 * // Validate a string:
 * isInteger("10");   // returns undefined (valid)
 * isInteger("10.5"); // returns "Must be an integer" (invalid)
 * isInteger("abc");  // returns "Must be an integer" (invalid)
 */

export function integer(): Validator<number | string> {
  return (v: number | string) => {
    if (v !== undefined && v !== null) {
      const num = Number(v);
      if (isNaN(num) || !Number.isInteger(num)) {
        return "Must be an integer";
      }
    }
  };
}
/**
 * Creates a validator function that checks if a string is a valid email address.
 * Uses a basic email validation regex.
 *
 * @returns A validator function that returns "Invalid email format" if the string is not a valid email address, otherwise undefined.
 *
 * @example
 * // Create an email validator:
 * const isEmail = email();
 *
 * // Validate an email address:
 * isEmail("test@example.com"); // returns undefined (valid)
 * isEmail("invalid");        // returns "Invalid email format" (invalid)
 * isEmail("test@.com");       // returns "Invalid email format" (invalid)
 */

export function email(): Validator<string> {
  // Basic email validation regex
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return (v: string) => {
    if (v && !emailRegex.test(v)) {
      return "Invalid email format";
    }
  };
}
