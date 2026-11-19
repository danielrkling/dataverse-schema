# Changelog

All notable changes to `dataverse-schema` are documented here.

## 2.1.0

### Added

- `dataverse-schema/provision`: additive table, column, and lookup provisioning
  from existing `DataverseTable` definitions. Includes planning/conflict
  detection, apply/publish helpers, retry-aware metadata reads, and formatted
  plan output.
- First-class definition metadata on tables and fields (`displayName`,
  `description`, table naming/ownership options, string/number/boolean/json/
  file/image provisioning options).
- Optional `default` export conditions alongside the ESM import conditions for
  every package entry.

### Fixed

- `client.getRecord()` returns `null` for 404/not-found responses.
- `$batch` payloads now use valid multipart HTTP parts, CRLF separators, proper
  inner headers, and reject GET requests inside changesets.
- Per-operation `Prefer` headers merge with client defaults instead of
  dropping annotations/page-size preferences.
- Collection-valued `$ref` associations use `POST`; single-valued associations
  remain `PUT`.
- Alternate keys render as quoted OData literals with quote escaping.
- FetchXML renders `null` / `not-null` correctly and lowers supported `not()`
  expressions through operator inversion and De Morgan transformations.
- Offline sync creates custom collection stores, routes filtered collections to
  the correct backend entity set, preserves unknown-table mutations in the
  errored store, scopes etag caches per table, and no longer stalls on delayed
  retries.
- Package entry metadata now explicitly publishes the provisioning entry and
  release documentation.

## 2.0.1

Previous public release.
