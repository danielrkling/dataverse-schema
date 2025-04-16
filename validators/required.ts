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

export function required() {
  return (v: any) => {
    if (!v) return "Required";
  };
}
