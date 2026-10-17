import { expect, test } from "vitest";
import { SharePointClient } from "../src/client";
import { SharePointTable } from "../src/table";
import { choice, datetime, document, json, people, person, multiLookup, lookup, primaryKey, text, title } from "../src/fields";
import { and, contains, endsWith, eq, gt, isNotNull, isNull, not, or, startsWith, spQuery } from "../src/query";


// Pure unit tests over the query builder: assert built OData v3 strings.

function Docs() {
    return new SharePointTable({
        client: new SharePointClient({ url: "https://x", token: "T" }),
        listTitle: "JCR",
        fields: {
            id: primaryKey(),
            title: title(),
            ko: text("KO"),
            status: choice("Status", { choices: ["Draft", "Pending", "Approved"] }),
            created: datetime("Created"),
            json: json("Concurrence_Status_JSON"),
            author: person("Author"),
            editor: person("Editor"),
            project: lookup("Project"),
            source: lookup("Source"),
            concurCodes: multiLookup("Concur_x0020_Codes"),
            reviewers: people("Reviewers"),
            file: document("FileLeafRef"),
        },
    });
}

test("select renders the declared field names, unknown keys excluded", () => {
    const q = Docs().query()
        .select((f) => ({ id: f.id, title: f.title, ko: f.ko, status: f.status, created: f.created, file: f.file }))
        .build();
    expect(q).toBe("$select=Id,Title,KO,Status,Created,FileLeafRef");
});

test("select: keys may be reordered arbitrarily (select order is ours to choose)", () => {
    const q = Docs().query()
        .select((f) => ({ ko: f.ko, created: f.created }))
        .build();
    expect(q).toBe("$select=KO,Created")
});

test("select fixes the record type to the picked subset", async () => {
    const DocsT = Docs();
    const q = DocsT.query().select((f) => ({ id: f.id, title: f.title }));
    // compile-time evidence: the resolved rows ARE the picked subset type:
    // narrowing the pick types the result: assigning an object missing the
    // picked keys fails tsc; this one compiles because it matches exactly.
    const typedRows: Awaited<ReturnType<typeof q.execute>> = [{ id: 1, title: "x" }];
    expect(typedRows[0].title).toBe("x");
});

test("references selected alone auto-expand with their standard carve-outs", () => {
    const q = Docs().query()
        .select((f) => ({ id: f.id, title: f.title, author: f.author, editor: f.editor, concurCodes: f.concurCodes, reviewers: f.reviewers }))
        .build();
    // person/people carry Id/Title/EMail, lookups Id/Title — without .expand()
    expect(q).toBe(
        "$select=Id,Title,Author/Id,Author/Title,Author/EMail,Editor/Id,Editor/Title,Editor/EMail,"
        + "Concur_x0020_Codes/Id,Concur_x0020_Codes/Title,Reviewers/Id,Reviewers/Title,Reviewers/EMail&$expand=Author,Editor,Concur_x0020_Codes,Reviewers",
    );
});

test("expand() ADDS extra props on top of the standard carve-outs (union)", () => {
    const q = Docs().query()
        .select((f) => ({ id: f.id, author: f.author }))
        .expand({ author: ["JobTitle"] }) // additional prop, standard set kept
        .build();
    expect(q).toBe("$select=Id,Author/Id,Author/Title,Author/EMail,Author/JobTitle&$expand=Author");
});

test("where: choice/person/lookup/datetime filter literals follow the field type", () => {
    const q0 = null;
    const q = Docs().query()
        .select((f) => ({ id: f.id }))
        .where((f) => [
            eq(f.status, "Draft"),
            eq(f.author, 17),
            eq(f.project, 3), // references filter on their numeric id
            gt(f.created, new Date("2026-01-02T03:04:05Z")),
        ])
        .build();
    expect(q).toContain("Status eq 'Draft'");
    expect(q).toContain("AuthorId eq 17");
    expect(q).toContain("ProjectId eq 3");
    expect(q).toContain("Created gt datetime'2026-01-02T03:04:05'");
});

test("where: and/or/not/isNull/isNotNull are composed with parens", () => {
    const q = Docs().query()
        .select((f) => ({ id: f.id }))
        .where((f) => and(
            or(eq(f.status, "Draft"), eq(f.status, "Approved")),
            startsWith(f.ko, "23"),
            contains(f.ko, "Nuc"),
            endsWith(f.ko, "A"),
            isNull(f.project),
            isNotNull(f.author),
            not(eq(f.status, "Pending")),
        ))
        .build();
    expect(q).toContain("(Status eq 'Draft' or Status eq 'Approved')");
    expect(q).toContain("startswith(KO, '23')");
    expect(q).toContain("substringof('Nuc', KO) eq true"); // OData v3 has no contains()
    expect(q).toContain("endswith(KO, 'A')");
    expect(q).toContain("ProjectId eq null");
    expect(q).toContain("AuthorId ne null");
    expect(q).toContain("not Status eq 'Pending'");
});

test("where: chained filters accumulate with and()", () => {
    const q = Docs().query()
        .select((f) => ({ id: f.id }))
        .where((f) => eq(f.status, "Draft"))
        .where((f) => startsWith(f.ko, "23"))
        .build();
    expect(q).toContain("(Status eq 'Draft') and (startswith(KO, '23'))");
});

test("where: string values escape single quotes", () => {
    const q = Docs().query().select((f) => ({ id: f.id }))
        .where((f) => eq(f.title, "O'Brien's"))
        .build();
    expect(q).toContain("Title eq 'O''Brien''s'");
});

test("orderby/top/skip render once each", () => {
    const q = Docs().query()
        .select((f) => ({ id: f.id }))
        .orderBy((f) => f.created, "desc")
        .orderBy((f) => f.title)
        .skip(10)
        .top(20)
        .build();
    expect(q).toBe("$select=Id&$orderby=Created desc,Title&$top=20&$skip=10");
});

test("empty select builds the full default select; standalone spQuery(table) mirrors query()", () => {
    expect(Docs().query().build()).toBe(
        "$select=Id,Title,KO,Status,Created,Concurrence_Status_JSON,"
        + "FileLeafRef,FileRef,"
        + "Author/Id,Author/Title,Author/EMail,Editor/Id,Editor/Title,Editor/EMail,"
        + "Project/Id,Project/Title,Source/Id,Source/Title,"
        + "Concur_x0020_Codes/Id,Concur_x0020_Codes/Title,"
        + "Reviewers/Id,Reviewers/Title,Reviewers/EMail"
        + "&$expand=Author,Editor,Project,Source,Concur_x0020_Codes,Reviewers");
    const DocsT = Docs();
    // top() alone still builds a full default select
    expect(spQuery(DocsT).top(3).build()).toContain("$top=3");
    expect(spQuery(DocsT).top(3).build()).toContain("FileRef");
});
