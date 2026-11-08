import { expectTypeOf, test } from "vitest";
import type { StandardSchemaV1 } from "@standard-schema/spec";
import { SharePointClient } from "../src/client";
import { SharePointTable } from "../src/table";
import { bool, choice, comments, json, lookup, number, person, primaryKey, title } from "../src/fields";
import type { Comment, InferTable } from "../src/fields";

// Compile-time checks for the package's headline feature: schema inference.
// Verified with `npm run test:types` (vitest --typecheck), never at runtime.

const client = new SharePointClient({ url: "https://x", token: "T" });

const metaSchema: StandardSchemaV1<{ priority: number }> = {
    "~standard": {
        version: 1,
        vendor: "test",
        validate: (value) => ({ value: value as { priority: number } }),
    },
};

const Tasks = new SharePointTable({
    client,
    listTitle: "Tasks",
    fields: {
        id: primaryKey(),
        title: title(),
        count: number("Count"),
        done: bool("Done"),
        status: choice("Status", { choices: ["Draft", "Done"] as const }),
        owner: person("Owner"),
        project: lookup("Project"),
        meta: json("Meta", { schema: metaSchema }),
        feed: comments(),
    },
});

type Task = InferTable<typeof Tasks>;

test("InferTable resolves the full record shape", () => {
    expectTypeOf<Task>().toMatchTypeOf<{
        id: number;
        title: string;
        count: number | null;
        done: boolean;
        status: "Draft" | "Done" | null;
        owner: { id: number; name?: string; email?: string } | null;
        project: { id: number; title?: string } | null;
        meta: { priority: number } | null;
        feed: Comment[] | undefined;
    }>();
});

test("phantom T mirrors InferTable", () => {
    expectTypeOf<typeof Tasks.T>().toEqualTypeOf<Task>();
    expectTypeOf(Tasks.fields.status.T).toEqualTypeOf<"Draft" | "Done" | null>();
});

test("select() fixes the builder result to the picked subset", () => {
    const q = Tasks.query().select((f) => ({ id: f.id, status: f.status, owner: f.owner }));
    type Rows = Awaited<ReturnType<typeof q.execute>>;
    expectTypeOf<Rows>().toEqualTypeOf<Array<{
        id: number;
        status: "Draft" | "Done" | null;
        owner: { id: number; name?: string; email?: string } | null;
    }>>();
});

test("getRecords resolves the inferred record array", () => {
    expectTypeOf(Tasks.getRecords).returns.resolves.toExtend<Task[]>();
});
