import { expect, test } from "vitest";
import { SharePointClient } from "../src/client";
import { SharePointTable } from "../src/table";
import { choice, datetime, document, json, people, person, multiLookup, lookup, primaryKey, text, title } from "../src/fields";
import { and, isNotNull, isNull, not, or, spQuery } from "../src/query";

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
        .select((f) => [f.id, f.title, f.ko, f.status, f.created, f.author, f.file])
        .build();
    expect(q).toBe("$select=Id,Title,KO,Status,Created,Author,FileLeafRef");
});

test("select: reordered options and strings pass through", () => {
    const q = Docs().query()
        .select((f) => ["Custom_x0020_Col", f.ko])
        .build();
    expect(q).toBe("$select=Custom_x0020_Col,KO");
});

test("expand adds reference $expand + Property/CarveOut select keys", () => {
    const q = Docs().query()
        .select((f) => [f.id, f.title])
        .expand({ author: ["Id", "Title", "EMail"], concurCodes: ["Id", "Title"] })
        .build();
    expect(q).toBe("$select=Id,Title,Author/Id,Author/Title,Author/EMail,Concur_x0020_Codes/Id,Concur_x0020_Codes/Title&$expand=Author,Concur_x0020_Codes");
});

test("where: choice/person/lookup/datetime filter literals follow the field type", () => {
    const q = Docs().query()
        .select((f) => [f.id])
        .where((f) => [
            f.status.eq("Draft"),
            f.author.eq(17),
            f.project.eq({ id: 3 }), // { id } accepted for references
            f.created.gt(new Date("2026-01-02T03:04:05Z")),
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
            or(f.status.eq("Draft"), f.status.eq("Approved")),
            f.ko.startsWith("23"),
            f.ko.contains("Nuc"),
            f.ko.endsWith("A"),
            isNull(f.project),
            isNotNull(f.author),
            not(f.status.eq("Pending")),
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
        .where((f) => f.status.eq("Draft"))
        .where((f) => f.ko.startsWith("23"))
        .build();
    expect(q).toContain("(Status eq 'Draft') and (startswith(KO, '23'))");
});

test("where: string values escape single quotes", () => {
    const q = Docs().query().select((f) => [f.id])
        .where((f) => f.title.eq("O'Brien's"))
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
