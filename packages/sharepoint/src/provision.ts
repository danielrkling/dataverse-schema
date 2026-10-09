import { SharePointClient } from "./client";
import {
    BooleanField,
    ChoiceField,
    DateField,
    DatetimeField,
    FieldBase,
    FileField,
    JsonField,
    LookupField,
    MultiChoiceField,
    MultiLookupField,
    NumberField,
    PeopleField,
    PersonField,
    StringField,
} from "./fields";
import type { SharePointTable } from "./table";

/**
 * List/column provisioning over the legacy `_api/web` surface.
 *
 * A column is created via `fields/createfieldasxml` with a CAML
 * `<Field ... />` schema string; each {@link FieldBase} kind has its own
 * pure definer export. Definers are independent (no switch, no shared
 * lookup tables), so importing only the ones you use tree-shakes cleanly.
 *
 * Anything the legacy surface cannot express **throws** — the schema is
 * the source of truth; silently narrowing would drift it.
 */

/** The CAML field schema string handed to `createfieldasxml`. */
export type FieldSchemaXml = string;

/** Options per definer where the field class alone is not enough. */
export type DefineFieldOptions = {
    /** Target list id (GUID) — required for lookup fields (`List="{...}"`). */
    listId?: string;
    /** The lookup display column (default `"Title"`). */
    showField?: string;
};

// --- shared XML assembly (pure, leaf-level — tree-shaking friendly) ---

function xmlEscape(value: string): string {
    return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function fieldAttrs(field: FieldBase<any>, type: string, extra: Record<string, string | undefined> = {}): string {
    const attrs = [
        `Type="${type}"`,
        `Name="${xmlEscape(field.name)}"`,
        `StaticName="${xmlEscape(field.name)}"`,
        `DisplayName="${xmlEscape(field.name)}"`,
        ...(field.options.readonly ? [`Readonly="TRUE"`] : []),
        ...Object.entries(extra)
            .filter(([, v]) => v !== undefined)
            .map(([k, v]) => `${k}="${xmlEscape(String(v))}"`),
    ];
    return attrs.join(" ");
}

/** A self-closing field definition. */
function flatField(field: FieldBase<any>, type: string, extra: Record<string, string | undefined> = {}): FieldSchemaXml {
    return `<Field ${fieldAttrs(field, type, extra)} />`;
}

/** A field definition with a `<CHOICES>` body. */
function bodyField(field: FieldBase<any>, type: string, body: string, extra: Record<string, string | undefined> = {}): FieldSchemaXml {
    return `<Field ${fieldAttrs(field, type, extra)}>${body}</Field>`;
}

function choicesXml(choices: readonly string[]): string {
    return `<CHOICES>${choices.map((c) => `<CHOICE>${xmlEscape(c)}</CHOICE>`).join("")}</CHOICES>`;
}

// --- per-kind definers (one independent export each) ---

export function defineText(field: StringField): FieldSchemaXml {
    return flatField(field, "Text");
}

export function defineNumber(field: NumberField): FieldSchemaXml {
    return flatField(field, "Number");
}

export function defineBool(field: BooleanField): FieldSchemaXml {
    return flatField(field, "Boolean");
}

/** `date()` reads/writes `Date`s but physically stores a DateTime column rendered date-only. */
export function defineDate(field: DateField): FieldSchemaXml {
    return flatField(field, "DateTime", { Format: "DateOnly" });
}

export function defineDatetime(field: DatetimeField): FieldSchemaXml {
    return flatField(field, "DateTime", { Format: "DateTime" });
}

/** json columns are serializable string values — multiline notes on the wire. */
export function defineJson(field: JsonField): FieldSchemaXml {
    return flatField(field, "Note", { RichText: "FALSE" });
}

export function defineChoice(field: ChoiceField): FieldSchemaXml {
    if (!field.choices?.length) throw new Error(`choice field "${field.name}" has no choices to define`);
    return bodyField(field, "Choice", choicesXml(field.choices));
}

/** Multi-choice stores `";#"`-joined values — exactly what the field reads. */
export function defineMultiChoice(field: MultiChoiceField): FieldSchemaXml {
    if (!field.choices?.length) throw new Error(`multiChoice field "${field.name}" has no choices to define`);
    return bodyField(field, "MultiChoice", choicesXml(field.choices));
}

export function definePerson(field: PersonField): FieldSchemaXml {
    return flatField(field, "User");
}

export function definePeople(field: PeopleField): FieldSchemaXml {
    return flatField(field, "UserMulti", { Mult: "TRUE" });
}

export function defineLookup(field: LookupField, options: DefineFieldOptions = {}): FieldSchemaXml {
    if (!options.listId) throw new Error(`lookup field "${field.name}" requires options.listId (the target list's GUID)`);
    return flatField(field, "Lookup", { List: options.listId, ShowField: options.showField ?? "Title" });
}

export function defineMultiLookup(field: MultiLookupField, options: DefineFieldOptions = {}): FieldSchemaXml {
    if (!options.listId) throw new Error(`multiLookup field "${field.name}" requires options.listId (the target list's GUID)`);
    return flatField(field, "Lookup", { List: options.listId, Mult: "TRUE", ShowField: options.showField ?? "Title" });
}

/**
 * Dispatcher: the XML for any field kind. Fans out to the per-kind definers —
 * import only this when any kind can appear; import individual definers to
 * keep the bundle minimal.
 *
 * Built-ins return `undefined` (skipped by {@link applyListFields}): `Id`
 * (every item carries it), `Title` (the default list column — re-creating it
 * would clash), and `document()` fields (the file *is* the item; the list
 * lifecycle picks the doc-lib template).
 */
export function defineField(field: FieldBase<any>, options: DefineFieldOptions = {}): FieldSchemaXml | undefined {
    if (field instanceof FileField) return undefined;
    if (field.name === "Id" || field.name === "Title") return undefined;
    if (field instanceof StringField) return defineText(field);
    if (field instanceof JsonField) return defineJson(field);
    if (field instanceof BooleanField) return defineBool(field);
    if (field instanceof DateField) return defineDate(field);
    if (field instanceof DatetimeField) return defineDatetime(field);
    if (field instanceof NumberField) return defineNumber(field);
    if (field instanceof MultiChoiceField) return defineMultiChoice(field);
    if (field instanceof ChoiceField) return defineChoice(field);
    if (field instanceof PeopleField) return definePeople(field);
    if (field instanceof PersonField) return definePerson(field);
    if (field instanceof MultiLookupField) return defineMultiLookup(field, options);
    if (field instanceof LookupField) return defineLookup(field, options);
    throw new Error(`defineField: no definer for field "${field.name}"`);
}

// --- list lifecycle + application ---

/** `SP.AddFieldOptions` bits honored by `createfieldasxml`. */
const ADD_FIELD_OPTIONS = { noContentType: 2, addToDefaultView: 8 } as const;

function listPath(listTitle: string): string {
    return `web/lists/getbytitle('${encodeURIComponent(listTitle)}')`;
}

/** Looks up a list by title for its GUID — what lookup definers need as `listId`. */
export async function resolveListId(client: SharePointClient, listTitle: string): Promise<string> {
    // client.fetch unwraps the verbose `d` envelope
    return (await client.fetch(`${listPath(listTitle)}?$select=Id`)) as string;
}

/** Creates a list (`BaseTemplate 100`) or a document library (`101`). */
export async function createList(
    client: SharePointClient,
    options: { title: string; template?: 100 | 101; description?: string },
): Promise<{ id: string }> {
    const body = {
        __metadata: { type: "SP.List" },
        AllowContentTypes: false,
        ContentTypesEnabled: false,
        BaseTemplate: options.template ?? 100,
        Title: options.title,
        ...(options.description ? { Description: options.description } : {}),
    };
    const result = (await client.fetch("web/lists", { method: "POST", body: JSON.stringify(body) })) as { Id: string };
    return { id: result.Id };
}

/** Deletes a list via `POST` + `X-HTTP-Method: DELETE` (`If-Match: *`). */
export async function deleteList(client: SharePointClient, listTitle: string): Promise<void> {
    await client.fetch(listPath(listTitle), {
        method: "POST",
        headers: { "X-HTTP-Method": "DELETE", "If-Match": "*" },
    });
}

/** Renames a list via a metadata MERGE on the list entity itself. */
export async function renameList(client: SharePointClient, listTitle: string, newTitle: string): Promise<void> {
    await client.fetch(listPath(listTitle), {
        method: "POST",
        headers: { "X-HTTP-Method": "MERGE", "If-Match": "*" },
        body: JSON.stringify({ __metadata: { type: "SP.List" }, Title: newTitle }),
    });
}

/** Adds one column to a list from its `<Field/>` schema (`fields/createfieldasxml`). */
export async function addListField(client: SharePointClient, listTitle: string, xml: FieldSchemaXml, options: { addToDefaultView?: boolean } = {}): Promise<void> {
    const optionsBits = ADD_FIELD_OPTIONS.noContentType | (options.addToDefaultView ? ADD_FIELD_OPTIONS.addToDefaultView : 0);
    await client.fetch(`${listPath(listTitle)}/fields/createfieldasxml`, {
        method: "POST",
        body: JSON.stringify({
            parameters: { __metadata: { type: "SP.XmlSchemaFieldCreationInformation" }, SchemaXml: xml, Options: optionsBits },
        }),
    });
}

/** Server `FieldTypeKind` value per CAML `Type` the definers emit. */
const FIELD_TYPE_KINDS: Record<string, number> = {
    Text: 2,
    Note: 3,
    DateTime: 4,
    Choice: 6,
    Number: 9,
    Boolean: 12,
    MultiChoice: 15,
    User: 20,
    Lookup: 20,
};

/**
 * Applies field definitions idempotently: existing matching columns are
 * skipped, a same-name column with a different stored type throws (schema
 * drift), and missing ones are created. `undefined` entries (built-ins from
 * {@link defineField}) are ignored. Returns per-column outcome.
 */
export async function applyListFields(
    client: SharePointClient,
    listTitle: string,
    definitions: (FieldSchemaXml | undefined)[],
    options: { addToDefaultView?: boolean } = {},
): Promise<{ added: string[]; skipped: string[] }> {
    const valid = definitions.filter((d): d is FieldSchemaXml => d !== undefined);
    if (valid.length === 0) return { added: [], skipped: [] };

    // client.fetch unwraps: collection reads yield the results array, single-entity reads the entity itself
    const existing = (await client.fetch(`${listPath(listTitle)}/fields?$select=InternalName,FieldTypeKind`)) as
        { InternalName: string; FieldTypeKind: number }[] | { InternalName: string; FieldTypeKind: number };
    const rows = Array.isArray(existing) ? existing : [existing];
    const existingByName = new Map<string, number>(rows.map((f) => [f.InternalName, f.FieldTypeKind]));

    const added: string[] = [];
    const skipped: string[] = [];
    for (const xml of valid) {
        const name = / Name="([^"]+)"/.exec(xml)![1]!;
        const xmlType = / Type="([^"]+)"/.exec(xml)![1]!;
        const wantedKind = FIELD_TYPE_KINDS[xmlType]!;
        const currentKind = existingByName.get(name);
        if (currentKind !== undefined) {
            if (currentKind === wantedKind) {
                skipped.push(name); // idempotent re-run
                continue;
            }
            throw new Error(`column "${name}" on list "${listTitle}" exists as FieldTypeKind ${currentKind} — schema wants ${wantedKind} (${xmlType})`);
        }
        await addListField(client, listTitle, xml, options);
        added.push(name);
    }
    return { added, skipped };
}

/** Doc-lib auto-template: any document() field ⇒ `101`. */
function resolveTemplate(table: SharePointTable<any>): 100 | 101 {
    const fields = table.fields as Record<string, FieldBase<any>>;
    return Object.values(fields).some((f) => f instanceof FileField) ? 101 : 100;
}

function fieldNameOf(table: SharePointTable<any>, field: FieldBase<any>): string {
    const fields = table.fields as Record<string, FieldBase<any>>;
    return Object.entries(fields).find(([, f]) => f === field)?.[0] ?? field.name;
}

/**
 * Provisions a whole table from its schema: creates the list (template
 * auto-picked 100/101 from any document() field) and applies every column.
 * Idempotent on the field application; list creation itself throws on an
 * existing same-title list (deliberate — re-pointing at a live list should
 * be explicit via {@link applyListFields}).
 *
 * @example
 * await provisionList(client, Tasks, {
 *   lookupListIds: { project: await resolveListId(client, "Projects") },
 * });
 */
export async function provisionList(
    client: SharePointClient,
    table: SharePointTable<any>,
    options: { lookupListIds?: Record<string, string>; addToDefaultView?: boolean; template?: 100 | 101; description?: string } = {},
): Promise<{ id: string; added: string[]; skipped: string[] }> {
    const template = options.template ?? resolveTemplate(table);
    const { id } = await createList(client, {
        title: table.listTitle,
        template,
        description: options.description,
    });
    const fields = table.fields as Record<string, FieldBase<any>>;
    const definitions = Object.values(fields).map((field) =>
        defineField(field, { listId: options.lookupListIds?.[fieldNameOf(table, field)] }),
    );
    const outcome = await applyListFields(client, table.listTitle, definitions, options);
    return { id, ...outcome };
}
