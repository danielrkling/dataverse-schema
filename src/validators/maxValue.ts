import { Validator } from "../types";

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
    if (typeof v === 'number' && v > max) {
      return `Must be no more than ${max}`;
    }
  };
}
