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
  return (v: { length: number; }) => {
    if (v.length > max) return `Length more than ${max}`;
  };
}
