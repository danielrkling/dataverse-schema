import { Validator } from "../types";

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
    if (typeof v === 'number' && v < min) {
      return `Must be at least ${min}`;
    }
  };
}
