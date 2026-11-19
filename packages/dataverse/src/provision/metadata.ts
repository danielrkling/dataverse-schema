import type { ResolvedColumn, ResolvedTable } from "./resolve";
import { publisherPrefixOf, validateSchemaName } from "./resolve";

/*
 * Dataverse metadata payload builders.
 *
 * Plain object builders so the exact JSON sent to the Web API is reviewable in
 * one place. Shapes follow the Web API metadata reference:
 *   POST /EntityDefinitions
 *   POST /EntityDefinitions(LogicalName='…')/Attributes
 *   POST /RelationshipDefinitions
 */

type JsonObject = Record<string, unknown>;

function localizedLabel(text: string, languageCode: number): JsonObject {
  return {
    "@odata.type": "Microsoft.Dynamics.CRM.LocalizedLabel",
    Label: text,
    LanguageCode: languageCode,
  };
}

function label(text: string | undefined, languageCode: number): JsonObject | undefined {
  if (text == null || text.trim().length === 0) {
    return undefined;
  }

  return {
    "@odata.type": "Microsoft.Dynamics.CRM.Label",
    LocalizedLabels: [localizedLabel(text, languageCode)],
  };
}

function requiredLevel(level: ResolvedColumn["requiredLevel"]): JsonObject {
  return {
    Value: level,
    CanBeChanged: true,
    ManagedPropertyLogicalName: "canmodifyrequirementlevelsettings",
  };
}

function optionSetOptions(column: ResolvedColumn, languageCode: number): JsonObject[] {
  return (column.options ?? []).map((option) => ({
    Value: option.value,
    Label: label(option.label, languageCode),
  }));
}

function baseAttribute(column: ResolvedColumn, languageCode: number): JsonObject {
  return {
    SchemaName: column.schemaName,
    DisplayName: label(column.displayName, languageCode),
    Description: label(column.description, languageCode),
    RequiredLevel: requiredLevel(column.requiredLevel),
  };
}

/** Payload for `.../Attributes` — every type except lookups, which use a relationship. */
export function buildAttributeDefinition(
  column: ResolvedColumn,
  languageCode: number,
): JsonObject {
  const base = baseAttribute(column, languageCode);

  switch (column.type) {
    case "string":
      return {
        ...base,
        "@odata.type": "Microsoft.Dynamics.CRM.StringAttributeMetadata",
        AttributeType: "String",
        AttributeTypeName: { Value: "StringType" },
        FormatName: { Value: column.format ?? "Text" },
        MaxLength: column.maxLength ?? 200,
        AutoNumberFormat: column.autoNumberFormat,
      };

    case "memo":
      return {
        ...base,
        "@odata.type": "Microsoft.Dynamics.CRM.MemoAttributeMetadata",
        AttributeType: "Memo",
        AttributeTypeName: { Value: "MemoType" },
        Format: column.format ?? "TextArea",
        ImeMode: "Disabled",
        IsLocalizable: false,
        MaxLength: column.maxLength ?? 2000,
      };

    case "integer":
      return {
        ...base,
        "@odata.type": "Microsoft.Dynamics.CRM.IntegerAttributeMetadata",
        AttributeType: "Integer",
        AttributeTypeName: { Value: "IntegerType" },
        Format: "None",
        MinValue: column.minValue,
        MaxValue: column.maxValue,
      };

    case "bigint":
      return {
        ...base,
        "@odata.type": "Microsoft.Dynamics.CRM.BigIntAttributeMetadata",
        AttributeType: "BigInt",
        AttributeTypeName: { Value: "BigIntType" },
        MinValue: column.minValue,
        MaxValue: column.maxValue,
      };

    case "decimal":
      return {
        ...base,
        "@odata.type": "Microsoft.Dynamics.CRM.DecimalAttributeMetadata",
        AttributeType: "Decimal",
        AttributeTypeName: { Value: "DecimalType" },
        Precision: column.precision ?? 2,
        MinValue: column.minValue,
        MaxValue: column.maxValue,
      };

    case "money":
      return {
        ...base,
        "@odata.type": "Microsoft.Dynamics.CRM.MoneyAttributeMetadata",
        AttributeType: "Money",
        AttributeTypeName: { Value: "MoneyType" },
        ...(column.precision == null
          ? { PrecisionSource: 2 }
          : { PrecisionSource: 0, Precision: column.precision }),
        MinValue: column.minValue,
        MaxValue: column.maxValue,
      };

    case "boolean":
      return {
        ...base,
        "@odata.type": "Microsoft.Dynamics.CRM.BooleanAttributeMetadata",
        AttributeType: "Boolean",
        AttributeTypeName: { Value: "BooleanType" },
        DefaultValue: column.defaultValue ?? false,
        OptionSet: {
          OptionSetType: "Boolean",
          TrueOption: { Value: 1, Label: label(column.trueLabel ?? "True", languageCode) },
          FalseOption: { Value: 0, Label: label(column.falseLabel ?? "False", languageCode) },
        },
      };

    case "datetime":
      return {
        ...base,
        "@odata.type": "Microsoft.Dynamics.CRM.DateTimeAttributeMetadata",
        AttributeType: "DateTime",
        AttributeTypeName: { Value: "DateTimeType" },
        Format: column.format ?? "DateAndTime",
      };

    case "choice":
      return {
        ...base,
        "@odata.type": "Microsoft.Dynamics.CRM.PicklistAttributeMetadata",
        AttributeType: "Picklist",
        AttributeTypeName: { Value: "PicklistType" },
        OptionSet: {
          "@odata.type": "Microsoft.Dynamics.CRM.OptionSetMetadata",
          IsGlobal: false,
          OptionSetType: "Picklist",
          Options: optionSetOptions(column, languageCode),
        },
      };

    case "multichoice":
      return {
        ...base,
        "@odata.type": "Microsoft.Dynamics.CRM.MultiSelectPicklistAttributeMetadata",
        AttributeType: "Virtual",
        AttributeTypeName: { Value: "MultiSelectPicklistType" },
        OptionSet: {
          "@odata.type": "Microsoft.Dynamics.CRM.OptionSetMetadata",
          IsGlobal: false,
          OptionSetType: "Picklist",
          Options: optionSetOptions(column, languageCode),
        },
      };

    case "file":
      return {
        ...base,
        "@odata.type": "Microsoft.Dynamics.CRM.FileAttributeMetadata",
        AttributeType: "File",
        AttributeTypeName: { Value: "FileType" },
        MaxSizeInKB: column.maxSizeInKB ?? 32768,
      };

    case "image":
      return {
        ...base,
        "@odata.type": "Microsoft.Dynamics.CRM.ImageAttributeMetadata",
        AttributeType: "Image",
        AttributeTypeName: { Value: "ImageType" },
        MaxSizeInKB: column.maxSizeInKB ?? 10240,
        CanStoreFullImage: column.canStoreFullImage ?? false,
      };

    case "lookup":
      throw new Error(
        `Lookup column "${column.logicalName}" must be created through the relationship API, not the attribute API.`,
      );
  }
}

/** Payload for the primary name attribute, created together with the table. */
export function buildPrimaryNameAttribute(
  table: ResolvedTable,
  languageCode: number,
): JsonObject {
  const primaryName = table.primaryName;

  if (primaryName == null) {
    throw new Error(
      `Table "${table.logicalName}" needs \`primaryName\` set to the key of its string() name field before it can be created.`,
    );
  }

  return {
    "@odata.type": "Microsoft.Dynamics.CRM.StringAttributeMetadata",
    AttributeType: "String",
    AttributeTypeName: { Value: "StringType" },
    SchemaName: primaryName.schemaName,
    DisplayName: label(primaryName.displayName, languageCode),
    Description: label(primaryName.description, languageCode),
    IsPrimaryName: true,
    RequiredLevel: requiredLevel("None"),
    FormatName: { Value: "Text" },
    MaxLength: primaryName.maxLength,
    AutoNumberFormat: primaryName.autoNumberFormat,
  };
}

/** Payload for `POST /EntityDefinitions`. */
export function buildEntityDefinition(
  table: ResolvedTable,
  languageCode: number,
): JsonObject {
  if (publisherPrefixOf(table.logicalName).length === 0) {
    throw new Error(
      `Table "${table.logicalName}" has no publisher prefix; only custom tables can be created. ` +
        'Use a logical name such as "nnsyc200_project", or add columns to the existing table instead.',
    );
  }

  validateSchemaName(table.schemaName, `Table "${table.logicalName}"`);

  return {
    "@odata.type": "Microsoft.Dynamics.CRM.EntityMetadata",
    SchemaName: table.schemaName,
    DisplayName: label(table.displayName, languageCode),
    DisplayCollectionName: label(table.displayCollectionName, languageCode),
    Description: label(table.description, languageCode),
    OwnershipType: table.ownership,
    IsActivity: false,
    HasActivities: false,
    HasNotes: false,
    Attributes: [buildPrimaryNameAttribute(table, languageCode)],
  };
}

/** Payload for `POST /RelationshipDefinitions` — creates the lookup column. */
export function buildRelationshipDefinition(
  table: ResolvedTable,
  column: ResolvedColumn,
  languageCode: number,
): JsonObject {
  if (column.targetLogicalName == null) {
    throw new Error(`Lookup column "${column.logicalName}" has no resolved target table.`);
  }

  if (column.relationshipName == null || column.relationshipName.length === 0) {
    throw new Error(`Lookup column "${column.logicalName}" has no resolved relationship name.`);
  }

  return {
    "@odata.type": "Microsoft.Dynamics.CRM.OneToManyRelationshipMetadata",
    SchemaName: column.relationshipName,
    ReferencedEntity: column.targetLogicalName,
    ReferencedAttribute: column.targetAttribute ?? `${column.targetLogicalName}id`,
    ReferencingEntity: table.logicalName,
    Lookup: {
      "@odata.type": "Microsoft.Dynamics.CRM.LookupAttributeMetadata",
      AttributeType: "Lookup",
      AttributeTypeName: { Value: "LookupType" },
      SchemaName: column.schemaName,
      DisplayName: label(column.displayName, languageCode),
      Description: label(column.description, languageCode),
      RequiredLevel: requiredLevel(column.requiredLevel),
    },
  };
}
