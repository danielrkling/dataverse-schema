# Proposal: Lazy `data` getters on FileRef and ImageRef

## Goal

Access binary content (files, images) through a `data` getter on the transformed record, without eagerly downloading blobs.

## Usage after implementation

```ts
const doc = await Document.getRecord(id);
const blob = await doc.attachment.data;       // Promise<Blob>
iframe.src = URL.createObjectURL(blob);

const account = await Account.getRecord(id);
const imgBlob = await account.logo.data;      // Promise<Blob>
img.src = URL.createObjectURL(imgBlob);
```

## Changes

### 1. FileRef type (`src/fields.ts`)

```ts
export type FileRef = {
  name: string;
  data?: Blob | Promise<Blob>;
  mimeType?: string;
}
```

User-provided FileRefs (for inserts/updates) still pass `Blob` directly.
Transformed FileRefs (from Dataverse) get a `Promise<Blob>` getter.

### 2. New ImageRef type (`src/fields.ts`)

```ts
export type ImageRef = {
  url: string;
  data: Promise<Blob>;
}
```

`ImageField` type changes from `string | null` to `ImageRef | null`.

### 3. Table-level `transformValueFromDataverse` (`src/table.ts:605`)

Detect file and image fields, wrap returned values with lazy `data` getters via `Object.defineProperty`.

For file fields — getter calls `this.downloadFile(recordId, key)`:

```ts
if (property.type === "file") {
  const fileName = value[property.fromDataverseName];
  if (fileName) {
    const table = this;
    const recordId = value[pk.property.fromDataverseName] as GUID;
    result[key] = Object.defineProperty(
      { name: fileName },
      "data",
      { get() { return table.downloadFile(recordId, key); } }
    );
  } else {
    result[key] = null;
  }
}
```

For image fields — getter fetches the binary from the Dataverse image URL:

```ts
if (property.type === "image") {
  const imageUrl = value[property.fromDataverseName];
  if (imageUrl) {
    const table = this;
    result[key] = Object.defineProperty(
      { url: imageUrl },
      "data",
      { get() { return table.client.fetch(imageUrl, { raw: true }).then(r => r.blob()); } }
    );
  } else {
    result[key] = null;
  }
}
```

### 4. `_uploadPendingFiles` guard (`src/table.ts:705`)

Change from `fileRef?.data` to `fileRef?.data instanceof Blob` so Promises from the lazy getter don't trigger re-uploads.

## What stays the same

- `uploadFile`, `downloadFile`, `deleteFile` — unchanged
- `insertRecord` / `updateRecord` — user still passes `{ name, data: Blob }` for uploads
- `FileField` constructor, `fromDataverseName` mapping — unchanged
- `ImageField` constructor — unchanged
- Field-level `transformValueFromDataverse` — unchanged (table-level override handles file/image)

## Note

The `data` getter is lost when records are serialized to IDB (structured clone doesn't preserve getters). Records loaded from IDB will only have `name`/`url` — no `data`. This is acceptable since IDB-loaded records are cached for display, not for blob access. If offline blob access is needed later, a separate IDB blob store can be added.
