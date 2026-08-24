export type BrowserTestConfig = {
  entitySetName: string
  logicalName: string
  collectionNav: string
  altKeyAttribute?: string
  globalOptionSet?: string
}

declare global {
  interface Window {
    __DV_TEST_CONFIG__?: Partial<BrowserTestConfig>
  }
}

const defaults: BrowserTestConfig = {
  entitySetName: "nnsyc200_test_tables",
  logicalName: "nnsyc200_test_table",
  collectionNav: "nnsyc200_test_table_Test_Lookup_nnsyc200_test_table",
  altKeyAttribute: "nnsyc200_alt_key",
  globalOptionSet: "nnsyc200_test_choice",
}

const paramMap: Record<string, keyof BrowserTestConfig> = {
  entity: "entitySetName",
  logical: "logicalName",
  nav: "collectionNav",
  altkey: "altKeyAttribute",
  optionset: "globalOptionSet",
}

export function loadConfig(): BrowserTestConfig {
  const params = new URLSearchParams(location.search)
  const overrides: Partial<BrowserTestConfig> = {}
  for (const [param, key] of Object.entries(paramMap)) {
    const value = params.get(param)
    if (value) (overrides as any)[key] = value
  }
  return { ...defaults, ...(window.__DV_TEST_CONFIG__ ?? {}), ...overrides }
}
