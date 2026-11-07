# dataverse-schema (monorepo)

npm-workspaces monorepo. See [packages/dataverse](./packages/dataverse) for the
library documentation.

| Package | Purpose |
| --- | --- |
| `packages/dataverse` (`dataverse-schema`) | Dataverse Web API client, schema/field system, OData + FetchXML query builders. Also ships the offline engine (`dataverse-schema/sync`) and TanStack DB adapters (`dataverse-schema/sync/tanstack`) as subpath entries |
| `packages/sharepoint` (`sharepoint-schema`) | SharePoint list/file access via the legacy `_api/web` REST API (OData v3): verbose-JSON client (Bearer / form-digest auth), schema-driven `SharePointTable` with MERGE/DELETE + etag concurrency, offline-engine-compatible |

## Commands

```bash
npm install
npm run build        # all packages
npm test             # all workspaces
npm run typecheck
npm run test:types   # type-level expectTypeOf tests
```
