# Browser Smoke Testing

Use `test/browser-smoke.ts` for tests that need to run against a real Dataverse environment from a phone or browser.

## Workflow

1. Edit `test/browser-smoke.ts`.
2. Add or update the test calls inside `run()`.
3. Keep all output going through `write()` and `reportError()` so it appears in `document.body`.
4. Build the standalone browser bundle:

   ```bash
   npm run build:browser-test
   ```

5. Commit both the source test and the generated `test/dist/browser-test/browser-test.js` when the bundle needs to be run from GitHub.
6. Load the bundle in the authenticated Dataverse page:

   ```html
   <script src="https://raw.githubusercontent.com/OWNER/REPO/BRANCH/test/dist/browser-test/browser-test.js"></script>
   ```

   Add a cache-busting query string when needed:

   ```html
   <script src="https://raw.githubusercontent.com/OWNER/REPO/BRANCH/test/dist/browser-test/browser-test.js?v=2"></script>
   ```

## Adding Tests

Keep tests small and run them sequentially so the output is easy to read:

```ts
async function run() {
  document.body.append(output)
  write("browser smoke test started")

  try {
    const client = new DataverseClient()
    const whoAmI = await WhoAmI(client)
    write("WhoAmI succeeded", whoAmI)

    const records = await client.getRecords("accounts", {
      query: "$select=name&$top=1",
    })
    write("account query succeeded", records)
  } catch (error) {
    reportError("smoke test failed", error)
  }
}
```

Use the current page's authentication and origin. Do not put tokens, passwords, or other secrets in this file or in the generated bundle.

## Local Checks

Run the typecheck and browser bundle build before publishing:

```bash
npx tsc --noEmit
npm run build:browser-test
```

The browser build is intentionally a single IIFE file with dependencies bundled. It does not require an import map or a module loader.
