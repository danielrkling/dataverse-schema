import { expect, test } from "vitest";
import { serializeODataAggregate, serializeODataSelect } from "../src/query/odata/ast";
import { serializeFetchXml } from "../src/query/fetchxml/ast";
import { StringField } from "../src/fields";

test("OData select AST serializes clauses deterministically", () => {
  const name = new StringField("name");
  const revenue = new StringField("revenue");
  const primaryContact = { name: "primarycontact", fromDataverseName: "primarycontact" } as any;
  expect(serializeODataSelect({
    kind: "odata-select",
    select: [[name], [revenue]],
    filters: [
      { type: "comparison", field: [name], operator: "eq", value: "A" },
      { type: "comparison", field: [revenue], operator: "gt", value: 10 },
    ],
    orderby: [{ field: [name], direction: "asc" }],
    expands: [{ navigation: primaryContact, query: { kind: "odata-select", select: [[new StringField("fullname")]], filters: [], orderby: [], expands: [] } }],
    top: 5,
  })).toBe("$select=name,revenue&$filter=(name eq 'A') and (revenue gt 10)&$orderby=name asc&$expand=primarycontact($select=fullname)&$top=5");
});

test("OData aggregate AST preserves aggregate clause order", () => {
  const revenue = new StringField("revenue");
  expect(serializeODataAggregate({
    kind: "odata-aggregate",
    filters: [{ type: "raw", value: "statecode eq 0" }],
    apply: {
      kind: "aggregate",
      expressions: [{ field: [revenue], operation: "sum", alias: "total" }],
    },
    orderby: [{ field: { kind: "alias", name: "total" }, direction: "desc" }],
    top: 10,
  })).toBe("$filter=statecode eq 0&$apply=aggregate(revenue with sum as total)&$orderby=total desc&$top=10");
});

test("OData filter AST serializes or, any, and all nodes", () => {
  const name = new StringField("name");
  const fullname = new StringField("fullname");
  const contacts = { name: "contacts", fromDataverseName: "contacts" } as any;
  expect(serializeODataSelect({
    kind: "odata-select",
    select: [],
    filters: [
      {
        type: "or",
        conditions: [
          { type: "comparison", field: [name], operator: "eq", value: "A" },
          { type: "comparison", field: [name], operator: "eq", value: "B" },
        ],
      },
      {
        type: "lambda",
        field: [contacts],
        operator: "any",
        alias: "c",
        condition: { type: "comparison", field: [fullname], operator: "eq", value: "A" },
      },
      {
        type: "lambda",
        field: [contacts],
        operator: "all",
        alias: "c",
        condition: { type: "null", field: [fullname], positive: false },
      },
    ],
    orderby: [],
    expands: [],
  })).toBe("$filter=((name eq 'A') or (name eq 'B')) and contacts/any(c: (c/fullname eq 'A')) and contacts/all(c: c/fullname ne null)");
});

test("FetchXML select AST serializes escaped nested nodes", () => {
  expect(serializeFetchXml({
    kind: "xml-select",
    entity: "accounts",
    attributes: [{ name: "name", alias: "account&name" }],
     filters: [{ type: "raw", value: "<filter type=\"and\"/>" }],
    orders: [{ attribute: "name", descending: true }],
    links: [{
      name: "contact",
      from: "contactid",
      to: "primarycontactid",
      linkType: "outer",
      attributes: [{ name: "fullname" }],
       filters: [],
      orders: [],
      links: [],
    }],
  })).toBe("<fetch><entity name=\"accounts\"><attribute name=\"name\" alias=\"account&amp;name\"/><filter type=\"and\"/><order attribute=\"name\" descending=\"true\"/><link-entity name=\"contact\" from=\"contactid\" to=\"primarycontactid\" link-type=\"outer\"><attribute name=\"fullname\"/></link-entity></entity></fetch>");
});

test("FetchXML aggregate AST marks aggregate fetches", () => {
  expect(serializeFetchXml({
    kind: "xml-aggregate",
    entity: "accounts",
    attributes: [{ name: "accountid", aggregate: "count", alias: "count" }],
    filters: [],
    orders: [],
    links: [],
  })).toBe("<fetch aggregate=\"true\"><entity name=\"accounts\"><attribute name=\"accountid\" alias=\"count\" aggregate=\"count\"/></entity></fetch>");
});
