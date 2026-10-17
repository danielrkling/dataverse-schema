import type { StandardSchemaV1 } from "@standard-schema/spec"
import { GUID } from "./types";
import { rxGUID } from "./util";

/**
 * A schema compatible with the Standard Schema V1 spec. Accepts any Standard
 * Schema implementation (valibot, Zod, ArkType, etc.), so field/table `schema`
 * options can be authored with whichever schema library the project uses.
 */
export type ValidationSchema<T> = StandardSchemaV1<T, T>

/** Shorthand for the spec's issue shape. */
type Issue = StandardSchemaV1.Issue;

function makeSchema<T>(
  validate: (value: unknown) => StandardSchemaV1.Result<T> | Promise<StandardSchemaV1.Result<T>>,
): ValidationSchema<T> {
  return {
    "~standard": {
      version: 1,
      vendor: "dataverse-schema",
      validate,
    },
  }
}

/**
 * Builds a schema from a synchronous predicate — the basic building block for
 * the library's built-in field schemas (string, number, choice membership...).
 */
export function checkSchema<T>(check: (value: unknown) => boolean, message: string): ValidationSchema<T> {
  return makeSchema<T>((value) => check(value) ? { value: value as T } : { issues: [{ message }] });
}

// --- Built-in field schemas (Standard Schema V1, no valibot required) ---

export const STRING_SCHEMA = checkSchema<string>((value) => typeof value === "string", "Expected a string");
export const NUMBER_SCHEMA = checkSchema<number>((value) => typeof value === "number", "Expected a number");
export const BOOLEAN_SCHEMA = checkSchema<boolean>((value) => typeof value === "boolean", "Expected a boolean");
export const DATE_SCHEMA = checkSchema<Date>((value) => value instanceof Date, "Expected a Date");
export const BLOB_SCHEMA = checkSchema<Blob>((value) => value instanceof Blob, "Expected a Blob");
export const GUID_SCHEMA = checkSchema<GUID>(
  (value) => typeof value === "string" && rxGUID.test(value),
  "Expected a GUID",
);

/**
 * Validates a value against a Standard Schema, throwing on failure. Works with
 * any Standard Schema V1 implementation (not just valibot). Prefer this over
 * `v.parse` for anything touching a `ValidationSchema`, since those may come
 * from a non-valibot library.
 */
export async function standardParse<T>(schema: ValidationSchema<T>, value: unknown): Promise<T> {
  const result = await schema["~standard"].validate(value);
  if (result.issues) throw new Error(formatIssues(result.issues));
  return result.value;
}

/**
 * Result of {@link standardSafeParse}. On failure the Standard Schema issues
 * are carried verbatim (including paths).
 */
export type StandardParseResult<T> =
  | { success: true; value: T }
  | { success: false; issues: ReadonlyArray<Issue> }

/**
 * Validates a value against a Standard Schema without throwing. Works with any
 * Standard Schema V1 implementation, including async ones.
 */
export async function standardSafeParse<T>(schema: ValidationSchema<T>, value: unknown): Promise<StandardParseResult<T>> {
  const result = await schema["~standard"].validate(value);
  if (result.issues) return { success: false, issues: result.issues };
  return { success: true, value: result.value };
}

function formatIssues(issues: ReadonlyArray<Issue>): string {
  return issues.map((issue) => {
    const path = (issue.path ?? []).map((seg) => typeof seg === "object" ? String(seg.key) : String(seg)).join(".");
    return path ? `${path}: ${issue.message}` : issue.message;
  }).join(", ");
}

/**
 * Composes a whole-record schema from an object of named child schemas
 * (e.g. a table's fields). Each child validates its entry independently and
 * any issues are tagged with the child's path — regardless of which schema
 * library produced each child. Async child schemas are supported.
 */
export function composeRecordSchema(children: Record<string, ValidationSchema<any>>): ValidationSchema<any> {
  const entries = Object.entries(children);
  return makeSchema(async (value: unknown) => {
    const input = (value ?? {}) as Record<string, unknown>;
    const settled = await Promise.all(entries.map(async ([key, child]) => [key, await child["~standard"].validate(input[key])] as const));
    const out: Record<string, unknown> = {};
    const issues: Issue[] = [];
    for (const [key, result] of settled) {
      if (result.issues) {
        for (const issue of result.issues) {
          issues.push({ ...issue, path: [{ key }, ...(issue.path ?? [])] });
        }
      } else {
        out[key] = result.value;
      }
    }
    if (issues.length > 0) return { issues };
    return { value: out };
  });
}

/**
 * Wraps a schema so it validates arrays of that schema, tagging element issues
 * with their index (e.g. `"0: message"`). Used by collection properties. Async
 * element schemas are supported.
 */
export function arrayOf<T>(child: ValidationSchema<T>): ValidationSchema<T[]> {
  return makeSchema(async (value: unknown): Promise<StandardSchemaV1.Result<T[]>> => {
    if (!Array.isArray(value)) return { issues: [{ message: "Expected an array" }] };
    const settled = await Promise.all(value.map(async (item) => await child["~standard"].validate(item)));
    const out: unknown[] = [];
    const issues: Issue[] = [];
    for (const [i, result] of settled.entries()) {
      if (result.issues) {
        for (const issue of result.issues) {
          issues.push({ ...issue, path: [{ key: i }, ...(issue.path ?? [])] });
        }
      } else {
        out[i] = result.value;
      }
    }
    if (issues.length > 0) return { issues };
    return { value: out as T[] };
  });
}

/**
 * Defers resolution of a schema until first validation. Used by navigation
 * properties whose related table may not exist yet (circular references).
 */
export function lazyOf<T>(getChild: () => ValidationSchema<T>): ValidationSchema<T> {
  let cached: ValidationSchema<T> | undefined;
  return makeSchema((value: unknown) =>
    (cached ??= getChild())["~standard"].validate(value),
  );
}

/**
 * Wraps a schema so it also accepts `null`. Used by lookup and nullable fields.
 */
export function nullableOf<T>(child: ValidationSchema<T>): ValidationSchema<T | null> {
  return makeSchema((value: unknown): StandardSchemaV1.Result<T | null> | Promise<StandardSchemaV1.Result<T | null>> => {
    if (value === null) return { value: null };
    return child["~standard"].validate(value) as StandardSchemaV1.Result<T | null>;
  });
}

/**
 * Wraps a schema so it also accepts `undefined`, folding it to `null`.
 */
export function optionalOf<T>(child: ValidationSchema<T>): ValidationSchema<T | null> {
  return makeSchema((value: unknown): StandardSchemaV1.Result<T | null> | Promise<StandardSchemaV1.Result<T | null>> => {
    if (value === undefined) return { value: null };
    return child["~standard"].validate(value) as StandardSchemaV1.Result<T | null>;
  });
}

/**
 * Wraps a schema so `null`, `undefined`, and empty/whitespace-only strings are
 * rejected. Used to implement the `required` field option (e.g. making a
 * nullable field reject empty values).
 */
export function requiredOf<T>(child: ValidationSchema<T>, message = "Value is required"): ValidationSchema<T> {
  return makeSchema((value: unknown) => {
    if (value === null || value === undefined) return { issues: [{ message }] };
    if (typeof value === "string" && value.trim().length === 0) return { issues: [{ message }] };
    return child["~standard"].validate(value);
  });
}
