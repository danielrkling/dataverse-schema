import { Suite } from "../harness/runner"
import { assert, assertEquals, assertInstanceOf } from "../harness/assert"
import { pngBlob } from "../harness/fixtures"
import { seedRow } from "../harness/seed"

export const filesSuite: Suite = {
  name: "files-images",
  title: "File & image columns",
  async setup(ctx) {
    ctx.state.row = await seedRow(ctx, { int: 3 })
  },
  tests: (ctx) => [
    {
      name: "upload file + image via afterSave",
      fn: async () => {
        await ctx.tables.TestTable.updateRecord(ctx.state.row, {
          file: { name: "smoke.txt", data: new Blob(["hello file content"]) },
          image: { data: pngBlob() },
        })
      },
    },
    {
      name: "file reads back as FileRef with the uploaded name",
      fn: async () => {
        const r = await ctx.tables.TestTable.getRecord(ctx.state.row)
        assertInstanceOf(r?.file ?? null, Object, "file ref object")
        assertEquals((r!.file as any)?.name, "smoke.txt", "uploaded filename")
      },
    },
    {
      name: "image reads back as ImageRef with a data URL",
      fn: async () => {
        const r = await ctx.tables.TestTable.getRecord(ctx.state.row)
        const img = (r as any)?.image
        assert(img && typeof img.url === "string", "image ref present")
        assert(String(img.url).startsWith("data:image/png;base64,"), `png data url, got ${String(img.url).slice(0, 40)}…`)
      },
    },
    {
      name: "raw file $value endpoint returns uploaded bytes",
      fn: async () => {
        const res = await ctx.client.getPropertyRawValue(ctx.tables.TestTable.entitySetName, ctx.state.row, "nnsyc200_file")
        assert(typeof res === "string" ? res === "hello file content" : res instanceof Response, "raw value responded")
        if (res instanceof Response) assertEquals(await res.text(), "hello file content", "round-tripped bytes")
      },
    },
    {
      name: "downloadImage returns a non-empty blob",
      fn: async () => {
        const blob = await ctx.tables.TestTable.downloadImage(ctx.state.row, "image")
        assert(blob.size > 0, `image blob empty (size ${blob.size})`)
      },
    },
    {
      name: "deleteFile / deleteImage clear the columns",
      fn: async () => {
        await ctx.tables.TestTable.deleteFile(ctx.state.row, "file")
        await ctx.tables.TestTable.deleteImage(ctx.state.row, "image")
        const r = await ctx.tables.TestTable.getRecord(ctx.state.row)
        assertEquals((r as any)?.file ?? null, null, "file cleared")
        assertEquals((r as any)?.image ?? null, null, "image cleared")
      },
    },
  ],
}
