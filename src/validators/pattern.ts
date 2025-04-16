import { Validator } from "../types";

/**
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
