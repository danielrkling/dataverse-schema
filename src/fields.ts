import { Schema } from "./schema";
import { Table } from "./table";
import { GenericProperties, GetTable, GUID, Infer } from "./types";
import { parseDateOnly, toDateOnly } from "./util";
import { isType } from "./validators";
import { isTypeOrNull } from "./validators";
import { StandardSchemaV1 } from "@standard-schema/spec";

export class BooleanField extends Schema<boolean> {
  kind = "value" as const;
  type = "boolean" as const;
  constructor(name: string) {
    super(name, false);
    this.check(isType("boolean"));
  }
}

export class NumberField extends Schema<number> {
  kind = "value" as const;
  type = "number" as const;
  constructor(name: string) {
    super(name, 0);
    this.check(isType("number"));
  }

  transformValueFromDataverse(value: any): number {
    return value ?? 0;
  }
}

export class NullableNumberField extends Schema<number | null> {
  kind = "value" as const;
  type = "number" as const;
  constructor(name: string) {
    super(name, null);
    this.check(isTypeOrNull("number"));
  }
}

export class StringField extends Schema<string> {
  kind = "value" as const;
  type = "string" as const;
  constructor(name: string) {
    super(name, "");
    this.check(isType("string"));
  }

  transformValueFromDataverse(value: any): string {
    return value ?? "";
  }
}

export class NullableStringField extends Schema<string | null> {
  kind = "value" as const;
  type = "string" as const;
  constructor(name: string) {
    super(name, null);
    this.check(isTypeOrNull("string"));
  }
}

export class PrimaryKeyField extends Schema<GUID> {
  kind = "value" as const;
  type = "primaryKey" as const;
  constructor(name: string) {
    super(name, "" as GUID);
    // this.setReadOnly();
    this.check(isType("string"));
  }

  getDefault(): GUID {
    return crypto.randomUUID();
  }
}

export class ListField<T extends string | number> extends Schema<T | null> {
  kind = "value" as const;
  type = "list" as const;
  list: Array<T>;
  constructor(name: string, list: Array<T>) {
    super(name, null);
    this.list = list;
    this.check((v) => {
      if (v !== null && !list.includes(v)) {
        return `${v} not in [${list}]`;
      }
    });
  }
}

export class DateTimeField extends Schema<Date> {
  kind = "value" as const;
  type = "date" as const;
  constructor(name: string) {
    super(name, new Date());
    this.check((v) => (v instanceof Date ? undefined : "value is not Date"));
  }
  getDefault(): Date {
    return new Date();
  }
  transformValueFromDataverse(value: any): Date {
    if (value === null) return new Date();
    return new Date(value);
  }
}

export class NullableDateTimeField extends Schema<Date | null> {
  kind = "value" as const;
  type = "date" as const;
  constructor(name: string) {
    super(name, null);
    this.check((v) =>
      v === null || v instanceof Date ? undefined : "value is not Date or null",
    );
  }
  transformValueFromDataverse(value: any): Date | null {
    if (value === null) return null;
    return new Date(value);
  }
}

export class DateField extends Schema<Date> {
  kind = "value" as const;
  type = "dateOnly" as const;
  constructor(name: string) {
    super(name, parseDateOnly(new Date().toISOString()));
    this.check((v) =>
      v instanceof Date ? undefined : "value is not Date",
    );
  }
  transformValueFromDataverse(value: any): Date {
    if (value === null) return parseDateOnly(new Date().toISOString());
    return parseDateOnly(value);
  }
  transformValueToDataverse(value: any) {
    return toDateOnly(value);
  }
}

export class NullableDateField extends Schema<Date | null> {
  kind = "value" as const;
  type = "dateOnly" as const;
  constructor(name: string) {
    super(name, null);
    this.check((v) =>
      v === null || v instanceof Date ? undefined : "value is not Date or null",
    );
  }
  transformValueFromDataverse(value: any): Date | null {
    if (value === null) return null;
    return parseDateOnly(value);
  }
  transformValueToDataverse(value: any) {
    return toDateOnly(value);
  }
}

export class FormattedField extends Schema<string | null> {
  kind = "value" as const;
  type = "formatted" as const;
  constructor(name: string) {
    super(name, null);
    this.fromDataverseName = `${name}@OData.Community.Display.V1.FormattedValue`;
    this.setReadOnly(true);
  }
}

export class ImageField extends Schema<string | null> {
  kind = "value" as const;
  type = "image" as const;
  constructor(name: string) {
    super(name, null);
    this.check(isTypeOrNull("string"));
  }
}

export class FileField extends Schema<string> {
  type = "file" as const;
  kind = "file" as const;

  constructor(name: string) {
    super(name, "");
    this.fromDataverseName = `${name}_name`;
    this.setReadOnly(true);
  }
}

export function boolean(name: string) {
  return new BooleanField(name);
}

export function number(name: string) {
  return new NumberField(name);
}

export function nullableNumber(name: string) {
  return new NullableNumberField(name);
}
export function string(name: string) {
  return new StringField(name);
}

export function nullableString(name: string) {
  return new NullableStringField(name);
}

export function primaryKey(name: string) {
  return new PrimaryKeyField(name);
}

export function list<T extends string | number>(name: string, list: Array<T>) {
  return new ListField<T>(name, list);
}

export function datetime(name: string) {
  return new DateTimeField(name);
}

export function date(name: string) {
  return new DateField(name);
}

export function nullableDate(name: string){
  return new NullableDateField(name)
}

export function nullableDateTime(name: string){
  return new NullableDateTimeField(name)
}

export function formatted(name: string) {
  return new FormattedField(name);
}

export function image(name: string) {
  return new ImageField(name);
}

export function file(name: string){
  return new FileField(name)
}

export class LookupIdProperty extends Schema<GUID | null> {
  kind = "navigation" as const;
  type = "lookupId" as const;
  navigationName: string;
  #getTable: GetTable<Table<GenericProperties>>;

  constructor(name: string, getTable: GetTable) {
    super(name, null);
    this.navigationName = name;
    this.#getTable = getTable;
    this.fromDataverseName = `_${name.toLowerCase()}_value`
    this.toDataverseName = `${this.name}@odata.bind`
  }

  #table: Table<{ id: PrimaryKeyField }> | undefined;
  get table(): Table<{ id: PrimaryKeyField }> {
    if (!this.#table) {
      const table = this.#getTable();
      const { property } = table.getPrimaryKey();
      this.#table = new Table(table.client, table.name, { id: property });
    }
    return this.#table;
  }


  transformValueToDataverse(value: any): string | null {
    if (value) {
      return `${this.table.name}(${value})`;
    } else {
      return null;
    }
  }
}

export class CollectionProperty<
  TProperties extends GenericProperties,
> extends Schema<Infer<TProperties>[]> {
  kind = "navigation" as const;
  type = "collection" as const;
  #getTable: GetTable<Table<TProperties>>;

  constructor(name: string, getTable: GetTable<Table<TProperties>>) {
    super(name, []);
    this.#getTable = getTable;
    this.check((v) =>
      !Array.isArray(v) ? "value is not an array" : undefined,
    );
  }

  #table: Table<TProperties> | undefined;
  get table(): Table<TProperties> {
    return (this.#table ??= this.#getTable());
  }

  transformValueFromDataverse(value: any): Infer<TProperties>[] {
    return Array.from(value ?? []).map((v: any) =>
      this.table.transformValueFromDataverse(v),
    );
  }

  getIssues(value: any, path: PropertyKey[] = []): StandardSchemaV1.Issue[] {
    const issues = super.getIssues(value, path);
    if (Array.isArray(value)) {
      issues.push(
        ...value
          .map((v: any, i: number) => this.table.getIssues(v, [...path, i]))
          .flat(1),
      );
    }
    return issues;
  }
}

export function collection<TProperties extends GenericProperties>(
  name: string,
  getTable: GetTable<Table<TProperties>>,
) {
  return new CollectionProperty(name, getTable);
}

export class CollectionIdsProperty extends Schema<GUID[]> {
  kind = "navigation" as const;
  type = "collectionIds" as const;
  #getTable: GetTable<Table<GenericProperties>>;

  constructor(name: string, getTable: GetTable) {
    super(name, []);
    this.#getTable = getTable;
    this.check((v) =>
      !Array.isArray(v) ? "value is not an array" : undefined,
    );
  }

  #table: Table<{ id: PrimaryKeyField }> | undefined;
  get table(): Table<{ id: PrimaryKeyField }> {
    if (!this.#table) {
      const table = this.#getTable();
      const { property } = table.getPrimaryKey();
      this.#table = new Table(table.client, table.name, { id: property });
    }
    return this.#table;
  }

  transformValueFromDataverse(value: any): GUID[] {
    return Array.from(value ?? []).map((v: any) => v[this.table.fields.id.name]);
  }

  getIssues(value: any, path: PropertyKey[] = []): StandardSchemaV1.Issue[] {
    const issues = super.getIssues(value, path);
    if (Array.isArray(value)) {
      issues.push(
        ...value
          .map((v: any, i: number) => this.table.fields.id.getIssues(v,[...path,i]))
          .flat(1),
      );
    }
    return issues;
  }
}

export function collectionIds(name: string, getTable: GetTable) {
  return new CollectionIdsProperty(name, getTable);
}

export function lookupId(name: string, getTable: GetTable) {
  return new LookupIdProperty(name, getTable);
}

export class LookupProperty<
  TProperties extends GenericProperties,
> extends Schema<Infer<TProperties> | null> {
  kind = "navigation" as const;
  type = "lookup" as const;
  #getTable: GetTable<Table<TProperties>>;

  constructor(name: string, getTable: GetTable<Table<TProperties>>) {
    super(name, null);
    this.#getTable = getTable;
  }

  #table: Table<TProperties> | undefined;
  get table(): Table<TProperties> {
    return (this.#table ??= this.#getTable());
  }

  transformValueFromDataverse(value: any): Infer<TProperties> | null {
    return value == null ? null : this.table.transformValueFromDataverse(value);
  }

  getIssues(value: any, path?: PropertyKey[]): StandardSchemaV1.Issue[] {
    const issues = super.getIssues(value, path);
    if (value !== null) {
      issues.push(...this.table.getIssues(value, path));
    }
    return issues;
  }
}

export function lookup<TProperties extends GenericProperties>(
  name: string,
  getTable: GetTable<Table<TProperties>>,
) {
  return new LookupProperty(name, getTable);
}
