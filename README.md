# dataverse-schema (monorepo)

npm-workspaces monorepo. See [packages/dataverse](./packages/dataverse) for the
library documentation.

| Package | Purpose |
| --- | --- |
| `packages/dataverse` (`dataverse-schema`) | Dataverse Web API client, schema/field system, OData + FetchXML query builders |
| `packages/sync` (`dataverse-schema-sync`) | Product-agnostic offline engine: durable IndexedDB mutation queue with flush/retry/conflict machinery, consumed by the Dataverse adapter (and future adapters, e.g. SharePoint) |
| `packages/sharepoint` (`sharepoint-schema`) | SharePoint list/file access via the legacy `_api/web` REST API (OData v3): verbose-JSON client (Bearer / form-digest auth), schema-driven `SharePointTable` with MERGE/DELETE + etag concurrency, offline-engine-compatible |

## Commands

```bash
npm install
npm run build        # sync first, then dataverse-schema
npm test             # both workspaces
npm run typecheck
npm run test:types   # type-level expectTypeOf tests
```
