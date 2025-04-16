import { Validator } from "../types";

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
