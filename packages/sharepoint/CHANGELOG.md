# Changelog

All notable changes to `sharepoint-schema` are documented here.

## 0.1.0

Initial public release.

- `SharePointClient` for the legacy `_api/web` REST API (OData v3, verbose JSON):
  Bearer / form-digest auth, `d.__next` pagination, `d`-envelope unwrapping.
- Schema-driven `SharePointTable` with CRUD, etag/optimistic concurrency, default
  select+expand projections, and structural compatibility with the offline sync
  engine's `SyncTable` contract.
- Field factories: `text`, `title`, `number`, `bool`, `date`, `datetime`, `json`,
  `choice`, `multiChoice`, `person`, `people`, `lookup`, `multiLookup`,
  `primaryKey`, `document`, `comments`.
- Typed, proxy-based OData v3 query builder: `select`, `where`, `expand`,
  `orderBy`, `top`, `skip`, `execute`.
- Document-library upload/download via the `document()` field channel.
- Item comments channel (`comments()`, `getComments`, `addComment`, `deleteComment`).
- CAML provisioning: per-kind definers, idempotent `applyListFields` /
  `provisionList`, and list lifecycle helpers.
- Phantom `T` properties and `InferTable` for zero-runtime type inference.
