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
        .select((f) => [f.id, f.title, f.ko, f.status, f.created, f.file])
        .build();
    expect(q).toBe("$select=Id,Title,KO,Status,Created,FileLeafRef");
});

test("select: reordered options and strings pass through", () => {
    const q = Docs().query()
        .select((f) => ["Custom_x0020_Col", f.ko])
        .build();
    expect(q).toBe("$select=Custom_x0020_Col,KO");
});

test("references selected alone auto-expand with their standard carve-outs", () => {
    const q = Docs().query()
        .select((f) => [f.id, f.title, f.author, f.editor, f.concurCodes, f.reviewers])
        .build();
    // person/people carry Id/Title/EMail, lookups Id/Title — without .expand()
    expect(q).toBe(
        "$select=Id,Title,Author/Id,Author/Title,Author/EMail,Editor/Id,Editor/Title,Editor/EMail,"
        + "Concur_x0020_Codes/Id,Concur_x0020_Codes/Title,Reviewers/Id,Reviewers/Title,Reviewers/EMail&$expand=Author,Editor,Concur_x0020_Codes,Reviewers",
    );
});

test("expand() ADDS extra props on top of the standard carve-outs (union)", () => {
    const q = Docs().query()
        .select((f) => [f.id, f.author])
        .expand({ author: ["JobTitle"] }) // additional prop, standard set kept
        .build();
    expect(q).toBe("$select=Id,Author/Id,Author/Title,Author/EMail,Author/JobTitle&$expand=Author");
});

test("where: choice/person/lookup/datetime filter literals follow the field type", () => {
    const q = Docs().query()
        .select((f) => [f.id])
        .where((f) => [
            eq(f.status, "Draft"),
            eq(f.author, 17),
            eq(f.project, { id: 3 }), // { id } accepted for references
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
        .select((f) => [f.id])
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
        .select((f) => [f.id])
        .where((f) => eq(f.status, "Draft"))
        .where((f) => startsWith(f.ko, "23"))
        .build();
    expect(q).toContain("(Status eq 'Draft') and (startswith(KO, '23'))");
});

test("where: string values escape single quotes", () => {
    const q = Docs().query().select((f) => [f.id])
        .where((f) => eq(f.title, "O'Brien's"))
        .build();
    expect(q).toContain("Title eq 'O''Brien''s'");
});

test("orderby/top/skip render once each", () => {
    const q = Docs().query()
        .select((f) => [f.id])
        .orderBy((f) => f.created, "desc")
        .orderBy((f) => f.title)
        .skip(10)
        .top(20)
        .build();
    expect(q).toBe("$select=Id&$orderby=Created desc,Title&$top=20&$skip=10");
});

test("empty builder produces an empty string; standalone spQuery(table) mirrors query()", () => {
    expect(Docs().query().build()).toBe("");
    const DocsT = Docs();
    expect(spQuery(DocsT).top(3).build()).toBe("$top=3");
});
