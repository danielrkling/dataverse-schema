# Releasing

The repository publishes three independent npm packages:

| Workspace | npm package | Current release line |
| --- | --- | --- |
| `packages/dataverse` | `dataverse-schema` | 2.x |
| `packages/sharepoint` | `sharepoint-schema` | 0.1.x |
| `packages/filesystem` | `filesystem-schema` | 0.1.x |

`dataverse-schema` follows minor releases for new subpath APIs and patch
releases for compatible fixes. The other two packages are pre-1.0: use patch
releases for compatible fixes and treat minor releases as potentially
breaking.

## Before publishing

1. Confirm the versions in each `packages/*/package.json` are not already on the
   registry:

   ```bash
   npm view dataverse-schema version
   npm view sharepoint-schema version
   npm view filesystem-schema version
   ```

2. Update the version without creating a Git tag:

   ```bash
   npm version 2.1.0 --workspace=dataverse-schema --no-git-tag-version
   npm version 0.1.1 --workspace=sharepoint-schema --no-git-tag-version
   npm version 0.1.1 --workspace=filesystem-schema --no-git-tag-version
   ```

3. Add the release to the corresponding `CHANGELOG.md`.

4. Run the complete release gate from a clean install:

   ```bash
   npm ci
   npm run release:check
   ```

   This runs typechecks, runtime tests, type-level tests, builds, and dry-run
   packing for every workspace.

5. Inspect the tarballs:

   ```bash
   npm pack --workspaces --dry-run
   ```

   The Dataverse tarball must contain `dist/index`, `dist/provision/index`,
   `dist/sync/index`, and `dist/sync/tanstack` JavaScript and declaration
   files. README, LICENSE, CHANGELOG, and package.json are included
   automatically.

6. Review the dependency changes:

   ```bash
   npm audit --omit=dev
   ```

## Publishing

Use the **Release to npm** GitHub Actions workflow
(`.github/workflows/release.yml`):

1. Run it first with `dry_run: true` and the intended package.
2. Configure the protected `npm` environment with an `NPM_TOKEN` repository
   secret that can publish all three packages.
3. Run again with `dry_run: false`.

The workflow uses npm provenance and `--access public`. It verifies the full
release gate before the publish job starts. Publishing `all` continues in this
order: `dataverse-schema`, `sharepoint-schema`, `filesystem-schema`. If a later
package fails, rerun only that package.

Local publishing is possible but not the default:

```bash
npm login
npm run release:check

npm publish --workspace=dataverse-schema --access public
npm publish --workspace=sharepoint-schema --access public
npm publish --workspace=filesystem-schema --access public
```

Omit `--provenance` for local publishes: npm provenance requires a supported
CI/OIDC provider (such as the GitHub Actions workflow). The local CLI will
still apply the account's normal publish-time 2FA/OTP requirements.

Never commit an npm token. Prefer a granular automation token or npm trusted
publishing, and rotate the token after personnel or CI access changes.

## After publishing

1. Verify registry metadata and tarball contents:

   ```bash
   npm view dataverse-schema@2.1.0 dist.tarball
   npm view sharepoint-schema@0.1.1 dist.tarball
   npm view filesystem-schema@0.1.1 dist.tarball
   ```

2. Create one annotated tag per published package:

   ```bash
   git tag -a dataverse-schema@2.1.0 -m "dataverse-schema 2.1.0"
   git tag -a sharepoint-schema@0.1.1 -m "sharepoint-schema 0.1.1"
   git tag -a filesystem-schema@0.1.1 -m "filesystem-schema 0.1.1"
   git push origin --tags
   ```

3. Install each package from the registry in a clean project and smoke-test
   its documented entry points (`dataverse-schema`, `/provision`, `/sync`,
   `/sync/tanstack`).

Never republish a version. If a release is wrong, deprecate it with `npm
deprecate` and publish a fixed patch version.
