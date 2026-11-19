import type { FieldBase, FileField, ImageField, StringField } from "../fields";
import type { DataverseTable, TableOwnership } from "../table";
import type { ProvisionColumnType, ProvisionTable, ProvisionWarning } from "./types";

/*
 * Turns live table/field definitions into resolved metadata descriptors.
 *
 * Names come from the definitions (`logicalName` / `schemaName`); anything the
 * definitions do not spell out (display names, lengths, precisions) falls back
 * to the same defaults the Dataverse reference implementation uses, derived
 * from the publisher-prefixed logical name.
 */

/** Dataverse customization prefixes: 2–8 letters/digits followed by an underscore. */
const PREFIX_PATTERN = /^[A-Za-z][A-Za-z0-9]{1,7}_$/;
const SCHEMA_NAME_PATTERN = /^[A-Za-z][A-Za-z0-9_]*$/;
const MAX_SCHEMA_NAME_LENGTH = 50;

export type ProvisionRequiredLevel = "None" | "Recommended" | "ApplicationRequired";

export type ResolvedPrimaryName = {
  key: string;
  logicalName: string;
  schemaName: string;
  displayName: string;
  description?: string;
  maxLength: number;
  autoNumberFormat?: string;
};

export type ResolvedColumn = {
  key: string;
  logicalName: string;
  schemaName: string;
  type: ProvisionColumnType;
  displayName: string;
  description?: string;
  requiredLevel: ProvisionRequiredLevel;
  maxLength?: number;
  format?: string;
  minValue?: number;
  maxValue?: number;
  precision?: number;
  trueLabel?: string;
  falseLabel?: string;
  defaultValue?: boolean;
  autoNumberFormat?: string;
  options?: { value: number; label: string }[];
  targetLogicalName?: string;
  targetAttribute?: string;
  relationshipName?: string;
  /** `MaxSizeInKB` for file/image columns. */
  maxSizeInKB?: number;
  /** Image columns: store the full-size image alongside the thumbnail. */
  canStoreFullImage?: boolean;
  /** Image columns: make this the table's primary image. */
  isPrimaryImage?: boolean;
};

export type ResolvedTable = {
  table: ProvisionTable;
  logicalName: string;
  /** Always present; falls back to the logical name for built-in tables. */
  schemaName: string;
  entitySetName: string;
  displayName: string;
  displayCollectionName: string;
  description?: string;
  ownership: TableOwnership;
  /** The primary name column, when `primaryName` is declared on the table. */
  primaryName?: ResolvedPrimaryName;
  columns: ResolvedColumn[];
  warnings: ProvisionWarning[];
};

/**
 * The publisher prefix of a logical name (`nnsyc200_project` → `nnsyc200_`).
 * Returns `""` for built-in names, which have no customization prefix.
 */
export function publisherPrefixOf(name: string): string {
  const index = name.indexOf("_");

  if (index <= 0) {
    return "";
  }

  const candidate = name.slice(0, index + 1);

  return PREFIX_PATTERN.test(candidate) ? candidate : "";
}

/** The logical name without its publisher prefix. */
export function shortNameOf(logicalName: string): string {
  return logicalName.slice(publisherPrefixOf(logicalName).length);
}

/** `due_date` → `Due Date`, `URL` → `URL`. */
export function humanize(value: string): string {
  const words = value
    .replaceAll("_", " ")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .trim();

  if (words.length === 0) {
    return value;
  }

  return words
    .split(/\s+/)
    .map((word) => (/^[A-Z0-9]{2,}$/.test(word) ? word : word.charAt(0).toUpperCase() + word.slice(1)))
    .join(" ");
}

/** Default display label for a logical name. */
export function defaultDisplayName(logicalName: string): string {
  return humanize(shortNameOf(logicalName));
}

/** Canonical `StringAttributeMetadata.FormatName` values, keyed by lower case. */
const STRING_FORMATS: Record<string, string> = {
  text: "Text",
  textarea: "TextArea",
  email: "Email",
  url: "Url",
  tickersymbol: "TickerSymbol",
  phone: "Phone",
  phoneticguide: "PhoneticGuide",
  versionnumber: "VersionNumber",
};

function normalizeStringFormat(format: string, label: string): string {
  const canonical = STRING_FORMATS[format.trim().toLowerCase()];

  if (canonical == null) {
    throw new Error(
      `${label} format "${format}" is not valid; use one of ${Object.values(STRING_FORMATS).join(", ")}.`,
    );
  }

  return canonical;
}

const WIRE_TYPES: Record<ProvisionColumnType, string> = {  string: "StringType",
  memo: "MemoType",
  integer: "IntegerType",
  bigint: "BigIntType",
  decimal: "DecimalType",
  money: "MoneyType",
  boolean: "BooleanType",
  datetime: "DateTimeType",
  choice: "PicklistType",
  multichoice: "MultiSelectPicklistType",
  lookup: "LookupType",
  file: "FileType",
  image: "ImageType",
};

/** Expected `AttributeTypeName` for a column type (`LookupType`, `StringType`, …). */
export function expectedAttributeTypeName(type: ProvisionColumnType): string {
  return WIRE_TYPES[type];
}

export function validateSchemaName(schemaName: string, label: string): string {
  if (!SCHEMA_NAME_PATTERN.test(schemaName)) {
    throw new Error(
      `${label} schema name "${schemaName}" is not valid; use letters, digits and underscores, starting with a letter.`,
    );
  }

  if (schemaName.length > MAX_SCHEMA_NAME_LENGTH) {
    throw new Error(
      `${label} schema name "${schemaName}" is ${schemaName.length} characters; the limit is ${MAX_SCHEMA_NAME_LENGTH}.`,
    );
  }

  return schemaName;
}

function validateMaxLength(value: number, max: number, label: string): number {
  if (!Number.isInteger(value) || value < 1 || value > max) {
    throw new Error(`${label} maxLength ${value} is invalid; use an integer between 1 and ${max}.`);
  }

  return value;
}

function validatePrecision(value: number, label: string): number {
  if (!Number.isInteger(value) || value < 0 || value > 10) {
    throw new Error(`${label} precision ${value} is invalid; use an integer between 0 and 10.`);
  }

  return value;
}

function validateMaxSizeInKB(value: number, max: number, label: string): number {
  if (!Number.isInteger(value) || value < 1 || value > max) {
    throw new Error(
      `${label} maxSizeInKB ${value} is invalid; use an integer between 1 and ${max}.`,
    );
  }

  return value;
}

function validateAutoNumberFormat(format: string, label: string): string {
  if (!/\{SEQNUM:(\d+)\}/.test(format)) {
    throw new Error(`${label} autoNumberFormat "${format}" must include a {SEQNUM:n} placeholder.`);
  }

  for (const match of format.matchAll(/\{SEQNUM:(\d+)\}/g)) {
    if (Number(match[1]) < 1) {
      throw new Error(`${label} autoNumberFormat has an invalid {SEQNUM:${match[1]}} length.`);
    }
  }

  for (const match of format.matchAll(/\{RANDSTRING:(\d+)\}/g)) {
    const length = Number(match[1]);

    if (length < 1 || length > 6) {
      throw new Error(
        `${label} autoNumberFormat uses {RANDSTRING:${length}}; the length must be between 1 and 6.`,
      );
    }
  }

  return format;
}

function choiceOptions(field: FieldBase<any>): { value: number; label: string }[] {
  const entries = Object.entries((field as unknown as { choices: Record<string, string> }).choices ?? {});

  if (entries.length === 0) {
    throw new Error(`Choice column "${field.logicalName}" has no options to provision.`);
  }

  const seen = new Set<number>();

  const options = entries.map(([key, label]) => {
    const value = Number(key);

    if (!Number.isInteger(value) || value < 0 || value > 2147483647) {
      throw new Error(
        `Choice column "${field.logicalName}" uses option value "${key}"; values must be integers between 0 and 2147483647.`,
      );
    }

    if (seen.has(value)) {
      throw new Error(`Choice column "${field.logicalName}" reuses option value ${value}.`);
    }

    if (String(label).trim().length === 0) {
      throw new Error(`Choice column "${field.logicalName}" has an empty label for option ${value}.`);
    }

    seen.add(value);

    return { value, label: String(label) };
  });

  return options.sort((a, b) => a.value - b.value);
}

function baseColumn(table: ResolvedTable, field: FieldBase<any>): Omit<ResolvedColumn, "type"> {
  return {
    key: field.logicalName,
    logicalName: field.logicalName,
    schemaName: validateSchemaName(field.schemaName, `Column "${field.logicalName}"`),
    displayName: field.displayName ?? defaultDisplayName(field.logicalName),
    description: field.description,
    requiredLevel: field.getRequired() ? "ApplicationRequired" : "None",
  };
}

/**
 * Resolves one field into a provisionable column, or returns a warning when
 * the field is a platform concept (N:N, file, image, app-level list, …).
 */
function resolveColumn(
  table: ResolvedTable,
  field: FieldBase<any>,
): { column: ResolvedColumn } | { warning: ProvisionWarning } {
  const label = `Column "${field.logicalName}"`;

  switch (field.type) {
    case "string": {
      const stringField = field as StringField;
      const format =
        stringField.autoNumberFormat != null
          ? "Text"
          : normalizeStringFormat(stringField.format ?? "Text", label);

      if (stringField.autoNumberFormat != null && format.toLowerCase() !== "text") {
        throw new Error(`${label} has autoNumberFormat, so its format must be "Text" (got "${format}").`);
      }

      return {
        column: {
          ...baseColumn(table, field),
          type: "string",
          maxLength: validateMaxLength(stringField.maxLength, 4000, label),
          format,
          autoNumberFormat:
            stringField.autoNumberFormat == null
              ? undefined
              : validateAutoNumberFormat(stringField.autoNumberFormat, label),
        },
      };
    }

    case "json": {
      const maxLength = (field as unknown as { maxLength: number }).maxLength;

      return {
        column: {
          ...baseColumn(table, field),
          type: "memo",
          maxLength: validateMaxLength(maxLength, 1048576, label),
          format: "TextArea",
        },
      };
    }

    case "boolean": {
      const booleanField = field as unknown as { trueLabel: string; falseLabel: string };

      return {
        column: {
          ...baseColumn(table, field),
          type: "boolean",
          trueLabel: booleanField.trueLabel,
          falseLabel: booleanField.falseLabel,
          defaultValue: field.getDefault() === true,
        },
      };
    }

    case "number": {
      const numberField = field as unknown as {
        columnType: "integer" | "bigint" | "decimal" | "money";
        minValue?: number;
        maxValue?: number;
        precision?: number;
      };

      if (numberField.minValue != null && numberField.maxValue != null && numberField.minValue > numberField.maxValue) {
        throw new Error(`${label} has minValue greater than maxValue.`);
      }

      const precision =
        numberField.precision == null ? undefined : validatePrecision(numberField.precision, label);

      return {
        column: {
          ...baseColumn(table, field),
          type: numberField.columnType ?? "decimal",
          minValue: numberField.minValue,
          maxValue: numberField.maxValue,
          precision: numberField.columnType === "decimal" ? (precision ?? 2) : precision,
        },
      };
    }

    case "dateOnly":
      return {
        column: { ...baseColumn(table, field), type: "datetime", format: "DateOnly" },
      };

    case "dateTime":
      return {
        column: { ...baseColumn(table, field), type: "datetime", format: "DateAndTime" },
      };

    case "choice":
      return {
        column: { ...baseColumn(table, field), type: "choice", options: choiceOptions(field) },
      };

    case "multiChoice":
      return {
        column: { ...baseColumn(table, field), type: "multichoice", options: choiceOptions(field) },
      };

    case "file": {
      const fileField = field as FileField;

      return {
        column: {
          ...baseColumn(table, field),
          type: "file",
          maxSizeInKB: validateMaxSizeInKB(fileField.maxSizeInKB, 10485760, label),
        },
      };
    }

    case "image": {
      const imageField = field as ImageField;

      return {
        column: {
          ...baseColumn(table, field),
          type: "image",
          maxSizeInKB: validateMaxSizeInKB(imageField.maxSizeInKB, 30720, label),
          canStoreFullImage: imageField.canStoreFullImage,
          isPrimaryImage: imageField.isPrimaryImage,
        },
      };
    }

    case "lookup":
    case "lookupId": {
      const target = (field as unknown as { table: DataverseTable<any> }).table;
      const lookup = field as unknown as { relationshipName?: string; targetAttribute?: string };
      const logicalName = field.logicalName;
      const relationshipName = lookup.relationshipName?.trim() || `${table.logicalName}_${logicalName}`;
      const prefix = publisherPrefixOf(logicalName);

      if (relationshipName.length > 100) {
        throw new Error(`${label} relationshipName "${relationshipName}" is longer than 100 characters.`);
      }

      if (prefix.length > 0 && !relationshipName.toLowerCase().startsWith(prefix.toLowerCase())) {
        throw new Error(
          `${label} relationshipName "${relationshipName}" must start with the publisher prefix "${prefix}".`,
        );
      }

      return {
        column: {
          ...baseColumn(table, field),
          type: "lookup",
          targetLogicalName: target.logicalName,
          /*
           * Use the target definition's declared primary key. That is correct for
           * tables whose id attribute is not `<logicalname>id` (e.g. a `person`
           * table keyed by `contactid`); `targetAttribute` overrides it.
           */
          targetAttribute:
            lookup.targetAttribute?.trim() || target.primaryKey.property.logicalName,
          relationshipName,
        },
      };
    }

    case "collection":
    case "collectionIds":
      return {
        warning: {
          item: `${table.logicalName}.${field.logicalName}`,
          message: `${field.type}() is a many-to-many navigation; many-to-many relationships are not provisioned.`,
        },
      };

    case "list":
      return {
        warning: {
          item: `${table.logicalName}.${field.logicalName}`,
          message: 'list() is an app-level value set with no Dataverse column; use choice() or multiChoice() to provision one.',
        },
      };

    case "dynamicMultiChoice":
      return {
        warning: {
          item: `${table.logicalName}.${field.logicalName}`,
          message: "multiChoice() without a choices map uses a global option set; global option sets are not provisioned.",
        },
      };

    default:
      // primaryKey is handled by the table (its attribute ships with the table).
      return {
        warning: {
          item: `${table.logicalName}.${field.logicalName}`,
          message: `${field.type}() is not a provisionable column type.`,
        },
      };
  }
}

function resolvePrimaryName(table: ProvisionTable): ResolvedPrimaryName | undefined {
  const key = table.primaryName;

  if (key == null) {
    return undefined;
  }

  const field = (table.fields as Record<string, FieldBase<any>>)[key];

  if (field == null) {
    throw new Error(`Table "${table.logicalName}" declares primaryName "${key}", but no such field exists.`);
  }

  if (field.type !== "string") {
    throw new Error(
      `Table "${table.logicalName}" primaryName "${key}" must be a string() field (got ${field.type}).`,
    );
  }

  const stringField = field as StringField;
  const logicalName = field.logicalName;

  if (logicalName === table.logicalName) {
    throw new Error(
      `Table "${table.logicalName}" cannot use "${logicalName}" as its primary name column; choose a different name.`,
    );
  }

  return {
    key,
    logicalName,
    schemaName: validateSchemaName(field.schemaName, `Primary name column "${logicalName}"`),
    displayName: field.displayName ?? defaultDisplayName(logicalName),
    description: field.description,
    maxLength: validateMaxLength(stringField.maxLength, 4000, `Primary name column "${logicalName}"`),
    autoNumberFormat:
      stringField.autoNumberFormat == null
        ? undefined
        : validateAutoNumberFormat(
            stringField.autoNumberFormat,
            `Primary name column "${logicalName}"`,
          ),
  };
}

/** Resolve a live table definition into the metadata the plan/payload layers consume. */
export function resolveTable(table: ProvisionTable): ResolvedTable {
  const prefix = publisherPrefixOf(table.logicalName);
  const shortName = table.logicalName.slice(prefix.length);

  if (shortName.length === 0) {
    throw new Error(`Table logical name "${table.logicalName}" is only a publisher prefix.`);
  }

  const displayName = table.displayName ?? defaultDisplayName(table.logicalName);
  const resolved: ResolvedTable = {
    table,
    logicalName: table.logicalName,
    schemaName:
      table.schemaName ??
      (prefix.length > 0
        ? `${prefix}${shortName.charAt(0).toUpperCase()}${shortName.slice(1)}`
        : table.logicalName),
    entitySetName: table.entitySetName,
    displayName,
    displayCollectionName: table.displayCollectionName ?? `${displayName}s`,
    description: table.description,
    ownership: table.ownership ?? "UserOwned",
    primaryName: resolvePrimaryName(table),
    columns: [],
    warnings: [],
  };

  const primaryKeyLogicalName = table.primaryKey.property.logicalName;
  const seenColumns = new Set<string>();
  const seenSchemaNames = new Set<string>();

  if (resolved.primaryName != null) {
    seenColumns.add(resolved.primaryName.logicalName);
    seenSchemaNames.add(resolved.primaryName.schemaName.toLowerCase());
  }

  for (const [key, field] of Object.entries(table.fields) as [string, FieldBase<any>][]) {
    if (field.type === "primaryKey" || field.getSystem()) {
      continue;
    }

    // Skip only the field named by `primaryName`, not every field that shares
    // its logical name (a duplicate must still be reported below).
    if (resolved.primaryName != null && key === resolved.primaryName.key) {
      continue;
    }

    // Formatted values are projections, not columns.
    if (field.type === "formatted") {
      continue;
    }

    if (field.logicalName === primaryKeyLogicalName) {
      continue;
    }

    if (seenColumns.has(field.logicalName)) {
      throw new Error(
        `Table "${table.logicalName}" declares the column "${field.logicalName}" more than once.`,
      );
    }

    seenColumns.add(field.logicalName);

    const result = resolveColumn(resolved, field);

    if ("warning" in result) {
      resolved.warnings.push(result.warning);
    } else {
      const schemaKey = result.column.schemaName.toLowerCase();

      if (seenSchemaNames.has(schemaKey)) {
        throw new Error(
          `Table "${table.logicalName}" declares the schema name "${result.column.schemaName}" more than once.`,
        );
      }

      seenSchemaNames.add(schemaKey);
      resolved.columns.push(result.column);
    }
  }

  const primaryImages = resolved.columns.filter(
    (column) => column.type === "image" && column.isPrimaryImage,
  );

  if (primaryImages.length > 1) {
    throw new Error(
      `Table "${table.logicalName}" declares more than one primary image column (${primaryImages
        .map((column) => column.logicalName)
        .join(", ")}); a table can have only one.`,
    );
  }

  return resolved;
}
