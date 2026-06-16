import { http, HttpResponse } from 'msw'

export const BASE_URL = 'https://testorg.crm.dynamics.com'
const API = `${BASE_URL}/api/data/v9.2`

const rxId = /\(([^)]+)\)/

const store = {
  accounts: [
    { accountid: 'a1b2c3d4-e5f6-7890-1234-567890abcdef', name: 'Test Corp', revenue: 1000000, statecode: 0 },
    { accountid: 'b2c3d4e5-f6a7-8901-2345-67890abcdef1', name: 'Sample Inc', revenue: 500000, statecode: 0 },
  ] as Record<string, any>[],
}

function idFrom(path: string): string | null {
  return rxId.exec(path)?.[1] ?? null
}

/**
 * Handlers are ordered from most-specific (exact path) to least-specific (:path param).
 * Dataverse uses parenthesized IDs like /accounts(id) - these are single URL segments
 * that match :path in path-to-regexp.
 */

export const handlers = [
  // ==================== EXACT PATH HANDLERS (no ID) ====================

  http.get(`${API}/accounts`, ({ request }) => {
    const filter = new URL(request.url).searchParams.get('$filter') || ''
    const data = filter.includes('statecode eq 0')
      ? store.accounts.filter(a => a.statecode === 0)
      : store.accounts
    return HttpResponse.json({ value: data })
  }),

  http.post(`${API}/accounts`, async ({ request }) => {
    const body = await request.json() as any
    const id = crypto.randomUUID()
    store.accounts.push({ accountid: id, ...body })
    return new HttpResponse(null, {
      status: 204,
      headers: { 'OData-EntityId': `${API}/accounts(${id})` },
    })
  }),

  http.get(`${API}/people`, () => HttpResponse.json({ value: [] })),
  http.post(`${API}/people`, async () => HttpResponse.json({ personid: crypto.randomUUID() })),

  // ==================== SUB-RESOURCE HANDLERS (/:path/:property/...) ====================

  http.put(`${API}/:path/:property/\$ref`, () => new HttpResponse(null, { status: 204 })),
  http.delete(`${API}/:path/:property/\$ref`, () => new HttpResponse(null, { status: 204 })),

  http.get(`${API}/:path/:property/\$value`, ({ params }) => {
    const id = idFrom(params.path as string)
    const account = store.accounts.find(a => a.accountid === id)
    if (!account) return new HttpResponse(null, { status: 404 })
    return new HttpResponse(String((account as any)[params.property as string] ?? ''), {
      headers: { 'Content-Type': 'text/plain' },
    })
  }),

  http.get(`${API}/:path/:property`, ({ params }) => {
    const id = idFrom(params.path as string)
    const account = store.accounts.find(a => a.accountid === id)
    if (!account) return new HttpResponse(null, { status: 404 })
    const val = (account as any)[params.property as string]
    return HttpResponse.json({ value: val ?? null })
  }),

  http.put(`${API}/:path/:property`, async ({ params, request }) => {
    const id = idFrom(params.path as string)
    const body = await request.json() as any
    const idx = store.accounts.findIndex(a => a.accountid === id)
    if (idx >= 0) (store.accounts[idx] as any)[params.property as string] = body.value
    return new HttpResponse(null, { status: 204 })
  }),

  http.delete(`${API}/:path/:property`, () => new HttpResponse(null, { status: 204 })),

  // ==================== ENTITY CRUD HANDLERS (/:path with parenthesized ID) ====================

  http.get(`${API}/:path`, ({ params }) => {
    const id = idFrom(params.path as string)
    // people entity
    if ((params.path as string).startsWith('people')) {
      return HttpResponse.json({ personid: id ?? 'test-id', fullname: 'Jane', person_age: 25 })
    }
    // addresses entity
    if ((params.path as string).startsWith('addresses')) {
      return HttpResponse.json({ addressid: id ?? 'test-id', street_Address: '456 Oak', zip_code: 12345 })
    }
    // accounts entity
    const account = store.accounts.find(a => a.accountid === id)
    if (!account) {
      return HttpResponse.json({ error: { code: '0x80060891', message: 'Not found' } }, { status: 404 })
    }
    return HttpResponse.json(account)
  }),

  http.patch(`${API}/:path`, async ({ params, request }) => {
    const id = idFrom(params.path as string)
    const body = await request.json() as any
    const idx = store.accounts.findIndex(a => a.accountid === id)
    if (idx >= 0) store.accounts[idx] = { ...store.accounts[idx], ...body }
    return new HttpResponse(null, { status: 204 })
  }),

  http.delete(`${API}/:path`, ({ params }) => {
    const id = idFrom(params.path as string)
    const idx = store.accounts.findIndex(a => a.accountid === id)
    if (idx >= 0) store.accounts.splice(idx, 1)
    return new HttpResponse(null, { status: 204 })
  }),

  // ==================== NAVIGATION PROPERTY HANDLERS ====================

  http.get(`${API}/:path/:nav/:rest*`, () => {
    return HttpResponse.json({ value: [{ addressid: 'addr-1', street_Address: '789 Pine', zip_code: 54321 }] })
  }),

  // ==================== BATCH ====================

  http.post(`${API}/\$batch`, async ({ request }) => {
    const text = await request.text()
    const bid = text.match(/--batch_([a-f0-9-]+)/)?.[1] ?? 'mock'
    const parts = text.split(`--batch_${bid}`).filter(p => p.includes('HTTP/1.1'))
    const body = parts.map(p => {
      const status = p.match(/HTTP\/1\.1\s+(\d+)/)?.[1] ?? '200'
      const data = p.match(/\r?\n\r?\n(.+)$/s)?.[1]?.trim() ?? ''
      return [
        `--batchresponse_${bid}`,
        'Content-Type: application/http',
        'Content-Transfer-Encoding: binary',
        '',
        `HTTP/1.1 ${status}`,
        'Content-Type: application/json',
        '',
        data,
      ].join('\r\n')
    }).join('\r\n')
    return new HttpResponse(
      `--batchresponse_${bid}\r\nContent-Type: multipart/mixed; boundary=batchresponse_${bid}\r\n\r\n${body}\r\n--batchresponse_${bid}--`,
      { headers: { 'Content-Type': `multipart/mixed; boundary=batchresponse_${bid}` } },
    )
  }),

  // ==================== FUNCTIONS ====================

  http.get(`${API}/WhoAmI`, () => HttpResponse.json({
    BusinessUnitId: 'bu-1111-2222-3333-4444',
    UserId: 'user-1111-2222-3333-4444',
    OrganizationId: 'org-1111-2222-3333-4444',
  })),

  http.get(`${API}/RetrieveTotalRecordCount*`, () => HttpResponse.json({ Values: [42] })),
  http.get(`${API}/GlobalOptionSetDefinitions*`, () => HttpResponse.json({
    Options: [
      { Value: 1, Color: '#000000', Label: { UserLocalizedLabel: { Label: 'Option A' } }, Description: { UserLocalizedLabel: { Label: 'Desc A' } } },
      { Value: 2, Color: '#FFFFFF', Label: { UserLocalizedLabel: { Label: 'Option B' } }, Description: { UserLocalizedLabel: { Label: 'Desc B' } } },
    ],
  })),
  http.get(`${API}/RetrieveAadUserRoles*`, () => HttpResponse.json({
    value: [{ name: 'System Administrator' }, { name: 'Sales Manager' }],
  })),

  // ==================== NEXT LINK PAGINATION ====================

  http.get(`https://nextlink-contoso.com/api/data/v9.2/accounts`, () => {
    return HttpResponse.json({ value: [{ accountid: 'paginated-id', name: 'Paginated Record' }] })
  }),
]
