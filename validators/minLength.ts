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
  return (v: { length: number; }) => {
    if (v.length < min) return `Length less than ${min}`;
  };
}
