import { Validator } from "../types";

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
