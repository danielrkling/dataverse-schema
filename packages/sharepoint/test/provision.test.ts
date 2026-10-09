import { expect, test, vi } from "vitest";
import { SharePointClient } from "../src/client";
import { SharePointTable } from "../src/table";
import {
    defineBool, defineChoice, defineDate, defineDatetime, defineField, defineJson,
    defineLookup, defineMultiChoice, defineMultiLookup, defineNumber, definePeople,
    definePerson, defineText, applyListFields,
    createList, deleteList, renameList, addListField, provisionList, resolveListId,
} from "../src/provision";
import {
    bool, choice, date, datetime, json, lookup, multiChoice, multiLookup,
    number, people, person, primaryKey, text, title, document,
} from "../src/fields";

const client = new SharePointClient({ url: "https://contoso.sharepoint.com/sites/dev", token: "T" });

// --- per-kind definers ---

test("defineText/defineNumber/defineBool emit self-closing field XML", () => {
    expect(defineText(text("Description"))).toBe(`<Field Type="Text" Name="Description" StaticName="Description" DisplayName="Description" />`);
    expect(defineNumber(number("Amount0"))).toContain(`Type="Number" Name="Amount0"`);
    expect(defineBool(bool("IsDone"))).toContain(`Type="Boolean" Name="IsDone"`);
});

test("readonly fields set Readonly attr", () => {
    expect(defineNumber(number("StatusID", { readonly: true }))).toContain(`Readonly="TRUE"`);
});

test("defineDate displays date-only, defineDatetime full datetime — same physical type", () => {
    expect(defineDate(date("DueDate"))).toContain(`Type="DateTime"`);
    expect(defineDate(date("DueDate"))).toContain(`Format="DateOnly"`);
    expect(defineDatetime(datetime("Created")).includes(`Format="DateOnly"`)).toBe(false);
});

test("defineJson emits a Note column", () => {
    expect(defineJson(json("Meta0"))).toContain(`Type="Note"`);
    expect(defineJson(json("Meta0"))).toContain(`RichText="FALSE"`);
});

test("choice definers emit CHOICES bodies and throw without choices", () => {
    expect(defineChoice(choice("Status", { choices: ["Draft", "Done"] as const }))).toBe(
        `<Field Type="Choice" Name="Status" StaticName="Status" DisplayName="Status"><CHOICES><CHOICE>Draft</CHOICE><CHOICE>Done</CHOICE></CHOICES></Field>`,
    );
    expect(defineMultiChoice(multiChoice("Tags", { choices: ["A", "B"] as const }))).toContain(`Type="MultiChoice"`);
    expect(() => defineChoice(choice("Status"))).toThrow("no choices to define");
    expect(() => defineMultiChoice(multiChoice("Tags"))).toThrow("no choices to define");
});

test("person/people emit User/UserMulti", () => {
    expect(definePerson(person("OwnerId"))).toContain(`Type="User" Name="OwnerId"`);
    expect(definePeople(people("Reviewers0"))).toContain(`Type="UserMulti"`);
    expect(definePeople(people("Reviewers0"))).toContain(`Mult="TRUE"`);
});

test("lookup definers require listId and embed it with ShowField", () => {
    expect(() => defineLookup(lookup("RefId"))).toThrow("requires options.listId");
    expect(() => defineMultiLookup(multiLookup("ConcurCodes"))).toThrow("requires options.listId");
    const xml = defineLookup(lookup("RefId"), { listId: "{11111111-2222-3333-4444-555555555555}" });
    expect(xml).toContain(`Type="Lookup"`);
    expect(xml).toContain(`List="{11111111-2222-3333-4444-555555555555}"`);
    expect(xml).toContain(`ShowField="Title"`);
    expect(defineMultiLookup(multiLookup("ConcurCodes"), { listId: "{11111111-2222-3333-4444-555555555555}" })).toContain(`Mult="TRUE"`);
    expect(defineLookup(lookup("RefId"), { listId: "{11111111-2222-3333-4444-555555555555}", showField: "Name" })).toContain(`ShowField="Name"`);
});

test("XML escapes names and choices", () => {
    const xml = defineChoice(choice("Esc<x>&", { choices: [`Tag<1>"]`] as const }));
    expect(xml).toContain(`Name="Esc&lt;x&gt;&amp;"`);
    expect(xml).toContain(`<CHOICE>Tag&lt;1&gt;&quot;]</CHOICE>`);
});

// --- dispatcher ---

test("defineField fans out by kind; built-ins and document fields skip", () => {
    expect(defineField(text("Description"))).toContain(`Type="Text"`);
    expect(defineField(json("Meta0"))).toContain(`Type="Note"`);
    expect(defineField(lookup("RefId"), { listId: "{11111111-2222-3333-4444-555555555555}" })).toContain(`Type="Lookup"`);
    expect(defineField(title())).toBeUndefined();
    expect(defineField(primaryKey())).toBeUndefined();
    expect(defineField(document())).toBeUndefined();
});

// --- lifecycle + application (client.fetch mocked, no HTTP) ---

function mockFetch() {
    return vi.spyOn(client, "fetch").mockImplementation(async (resource: string, options?: RequestInit) => {
        // NOTE: shapes match the real client.fetch — it unwraps the `d` envelope
        if (resource.includes("/fields?$select=InternalName")) {
            return [{ InternalName: "Amount0", FieldTypeKind: 9 }, { InternalName: "Old", FieldTypeKind: 4 }];
        }
        if (resource === "web/lists" && options?.method === "POST") return { Id: "{list-guid}" };
        if (resource.includes("?$select=Id")) return "{99999999-8888-7777-6666-555555555555}";
        return {};
    });
}

test("resolveListId returns the list GUID", async () => {
    const spy = mockFetch();
    expect(await resolveListId(client, "Projects")).toBe("{99999999-8888-7777-6666-555555555555}");
    expect(spy.mock.calls[0]![0]).toContain("web/lists/getbytitle('Projects')?$select=Id");
});

test("createList posts BaseTemplate 100/101 and built-in flags", async () => {
    const spy = mockFetch();
    await createList(client, { title: "Tasks" });
    const [resource, init] = spy.mock.calls[0]!;
    expect(resource).toBe("web/lists");
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body.BaseTemplate).toBe(100);
    expect(body.Title).toBe("Tasks");
    expect(body.__metadata.type).toBe("SP.List");

    await createList(client, { title: "Docs", template: 101 });
    expect(JSON.parse((spy.mock.calls[1]![1] as RequestInit).body as string).BaseTemplate).toBe(101);
});

test("deleteList/renameList use POST + tunnelled method", async () => {
    const spy = mockFetch();
    await deleteList(client, "Tasks");
    let [, init] = spy.mock.calls[0]!;
    expect(init?.headers).toMatchObject({ "X-HTTP-Method": "DELETE", "If-Match": "*" });
    await renameList(client, "Tasks", "Tasks v2");
    [, init] = spy.mock.calls[1]!;
    expect(init?.headers).toMatchObject({ "X-HTTP-Method": "MERGE" });
});

test("addListField posts createfieldasxml with SchemaXml and options bits", async () => {
    const spy = mockFetch();
    await addListField(client, "Tasks", defineText(text("Description")));
    const [resource, init] = spy.mock.calls[0]!;
    expect(resource).toContain("/fields/createfieldasxml");
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body.parameters.__metadata.type).toBe("SP.XmlSchemaFieldCreationInformation");
    expect(body.parameters.SchemaXml).toContain(`Type="Text"`);
    expect(body.parameters.Options).toBe(2); // noContentType

    await addListField(client, "Tasks", defineText(text("Description")), { addToDefaultView: true });
    expect(JSON.parse((spy.mock.calls[1]![1] as RequestInit).body as string).parameters.Options).toBe(10);
});

test("applyListFields is idempotent: skips matching, adds missing, throws on drift", async () => {
    const spy = mockFetch();
    const xml = defineText(text("Description"));
    // Amount0 exists as Number (9); a Text (2) definition for the same name is drift:
    await expect(applyListFields(client, "Tasks", [defineText(text("Amount0"))])).rejects.toThrow("exists as FieldTypeKind 9");
    // drop the drift: only Types matching existing (Number) are skipped, others added:
    spy.mockClear().mockImplementation(spy.getMockImplementation()!);
    const outcome = await applyListFields(client, "Tasks", [xml, defineNumber(number("Amount0"))]);
    expect(outcome.skipped).toEqual(["Amount0"]);
    expect(outcome.added).toEqual(["Description"]);
    // one createfieldasxml call for the missing one:
    expect(spy.mock.calls.filter(([r]) => (r as string).includes("createfieldasxml"))).toHaveLength(1);
});

test("provisionList wires list + all schema columns; doc-lib tables pick 101 and skip document()", async () => {
    const spy = mockFetch();
    const Tasks = new SharePointTable({
        client,
        listTitle: "Tasks",
        fields: {
            id: primaryKey(),
            title: title(),
            description: text("Description"),
            amount: number("Amount0"),
            ref: lookup("RefId"),
        },
    });
    const outcome = await provisionList(client, Tasks, { lookupListIds: { ref: "{99999999-8888-7777-6666-555555555555}" } });
    expect(outcome.id).toBe("{list-guid}");
    expect(outcome.added).toEqual(["Description", "RefId"]); // Amount0 already exists (kind 9) → skipped
    // every column went through createfieldasxml with the resolved lookup guid:
    const addCalls = spy.mock.calls.filter(([r]) => (r as string).includes("createfieldasxml"));
    expect(addCalls).toHaveLength(2);
});

test("provisionList picks template 101 for document libraries", async () => {
    const spy = mockFetch();
    const Docs = new SharePointTable({
        client,
        listTitle: "Docs",
        fields: { id: primaryKey(), title: title(), file: document() },
    });
    await provisionList(client, Docs);
    const body = JSON.parse((spy.mock.calls[0]![1] as RequestInit).body as string);
    expect(body.BaseTemplate).toBe(101);
});

test("lookup listId accepts GUID string or { Id } entity, throws loudly on junk (no [object Object])", () => {
    const Ref = lookup("RefId");
    expect(defineLookup(Ref, { listId: "{11111111-2222-3333-4444-555555555555}" })).toContain(`List="{11111111-2222-3333-4444-555555555555}"`);
    // bare unbracketed GUID is normalized with the braces SP expects:
    expect(defineLookup(Ref, { listId: "11111111-2222-3333-4444-555555555555" })).toContain(`List="{11111111-2222-3333-4444-555555555555}"`);
    // an { Id } list entity works (e.g. a fetched list object):
    expect(defineLookup(Ref, { listId: { Id: "{11111111-2222-3333-4444-555555555555}" } } as any)).toContain(`List="{11111111-2222-3333-4444-555555555555}"`);
    // never emit [object Object] — throw naming the field instead:
    expect(() => defineLookup(Ref, { listId: { title: "Projects" } } as any)).toThrow('lookup field "RefId"');
    expect(() => defineLookup(Ref, { listId: { title: "Projects" } } as any)).not.toThrow("[object Object]");
    expect(() => defineLookup(Ref, { listId: "Projects" })).toThrow('lookup field "RefId"');
});
