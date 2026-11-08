import { expectTypeOf, test } from "vitest";
import {
  bool,
  choice,
  date,
  FileSystemDatabase,
  type FileSystemTable,
  primaryKey,
  number,
  text,
  type InferRecord,
} from "../src";

const fields = {
  id: primaryKey(),
  title: text("title"),
  done: bool("done"),
  amount: number("amount"),
  due: date("due"),
  status: choice("status", { choices: ["Draft", "Done"] as const }),
};

type Row = InferRecord<typeof fields>;

test("field factories infer the record type", () => {
  expectTypeOf<Row>().toEqualTypeOf<{
    id: string;
    title: string;
    done: boolean;
    amount: number | null;
    due: Date | null;
    status: "Draft" | "Done" | null;
  }>();
});

test("the table phantom T carries the schema types", () => {
  const Tasks = {} as FileSystemTable<typeof fields>;
  expectTypeOf(Tasks.T).toEqualTypeOf<Row>();
  expectTypeOf<typeof fields.id.T>().toEqualTypeOf<string>();
});

test("real File System Access handles are accepted structurally", () => {
  // Compile-time only.
  void (() => {
    const root = null as unknown as FileSystemDirectoryHandle;
    void FileSystemDatabase.open(root, { version: 1, brandId: "acme" });
    void FileSystemDatabase.initialize(root, { version: 1, brandId: "acme" });
  });
});
