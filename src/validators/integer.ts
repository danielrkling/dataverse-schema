import { Validator } from "../types";

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
