# dataverse-schema (monorepo)

npm-workspaces monorepo. See [packages/dataverse](./packages/dataverse) for the
library documentation.

| Package | Purpose |
| --- | --- |
| `packages/dataverse` (`dataverse-schema`) | Dataverse Web API client, schema/field system, OData + FetchXML query builders. Also ships additive metadata provisioning (`dataverse-schema/provision`), the offline engine (`dataverse-schema/sync`), and TanStack DB adapters (`dataverse-schema/sync/tanstack`) as subpath entries |
| `packages/sharepoint` (`sharepoint-schema`) | SharePoint list/file access via the legacy `_api/web` REST API (OData v3): verbose-JSON client (Bearer / form-digest auth), schema-driven `SharePointTable` with MERGE/DELETE + etag concurrency, offline-engine-compatible |
| `packages/filesystem` (`filesystem-schema`) | File System Access API as a local database: root-folder `version`/`brandId` manifest verification, schema-driven folder tables (one JSON file per record) and single-file tables |

## Commands

Development requires Node.js 22.18 LTS or Node.js 24.11+; the published packages
support Node.js 18+ at runtime.

```bash
npm install
npm run build        # all packages
npm test             # all workspaces
npm run typecheck
npm run test:types   # type-level expectTypeOf tests
npm run release:check # full gate: tests, types, build, dry-run packing
```

See [RELEASING.md](./RELEASING.md) for versioning, npm publishing, and the
manual provenance-enabled GitHub Actions workflow.
