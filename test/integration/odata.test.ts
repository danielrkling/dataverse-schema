import { expect, test } from "vitest"
import { DataverseClient } from "../../src/client"
import { fetchOdata } from "../../src"
import { DataverseTable, primaryKey, string, number, lookup, lookupId, collection } from "../../src"
import { http, HttpResponse } from "msw"
import { server } from "../mocks/server"
import { BASE_URL } from "../mocks/handlers"

const client = new DataverseClient({ url: BASE_URL })
const API = `${BASE_URL}/api/data/v9.2`

// --- Tables matching MS Docs account/contact/task/systemuser schema ---
// Use a minimal _AccountRef to break circular refs (Account↔Contact↔Account).
// _AccountRef has the same entitySetName but omits primaryContact so Contact
// can reference it without creating a cycle.

const SystemUser = new DataverseTable({
  client, entitySetName: "systemusers", logicalName: "systemuser",
  fields: {
    systemuserid: primaryKey("systemuserid"),
    fullname: string("fullname"),
    ownerid: string("ownerid"),
  },
})

const _AccountRef = new DataverseTable({
  client, entitySetName: "accounts", logicalName: "account",
  fields: {
    accountid: primaryKey("accountid"),
    name: string("name"),
    revenue: number("revenue"),
    createdById: lookupId("createdby", () => SystemUser),
    createdBy: lookup("createdby", () => SystemUser),
  },
})

const Contact = new DataverseTable({
  client, entitySetName: "contacts", logicalName: "contact",
  fields: {
    contactid: primaryKey("contactid"),
    fullname: string("fullname"),
    createdById: lookupId("createdby", () => SystemUser),
    createdBy: lookup("createdby", () => SystemUser),
    parentCustomerIdAccount: lookup("parentcustomerid_account", () => _AccountRef),
    owningUserId: lookupId("owninguser", () => SystemUser),
    owningUser: lookup("owninguser", () => SystemUser),
  },
})

const Task = new DataverseTable({
  client, entitySetName: "tasks", logicalName: "task",
  fields: {
    activityid: primaryKey("activityid"),
    subject: string("subject"),
    regardingObjectIdContactTask: lookup("regardingobjectid_contact_task", () => Contact),
  },
})

const Account = new DataverseTable({
  client, entitySetName: "accounts", logicalName: "account",
  fields: {
    accountid: primaryKey("accountid"),
    name: string("name"),
    revenue: number("revenue"),
    primaryContactId: lookupId("primarycontactid", () => Contact),
    primaryContact: lookup("primarycontactid", () => Contact),
    createdById: lookupId("createdby", () => SystemUser),
    createdBy: lookup("createdby", () => SystemUser),
    accountTasks: collection("Account_Tasks", () => Task),
    contactCustomerAccounts: collection("contact_customer_accounts", () => Contact),
  },
})

// ============================================================
// Test 1: select-columns
// MS Docs: GET [ORG]/api/data/v9.2/accounts?$select=name,revenue&$top=1
// ============================================================
test("MS Docs select-columns: $select=name,revenue&$top=1", async () => {
  server.use(
    http.get(`${API}/accounts`, ({ request }) => {
      const url = new URL(request.url)
      expect(url.searchParams.get("$select")).toBe("name,revenue")
      expect(url.searchParams.get("$top")).toBe("1")
      return HttpResponse.json({
        "@odata.context": "[Organization URI]/api/data/v9.2/$metadata#accounts(name,revenue)",
        value: [
          {
            "@odata.etag": "W/\"81052965\"",
            name: "Litware, Inc. (sample)",
            revenue: 20000.0000,
            _transactioncurrencyid_value: "228f42f8-e646-e111-8eb7-78e7d162ced1",
            accountid: "4624eff7-53d3-ed11-a7c7-000d3a993550",
          },
        ],
      })
    }),
  )

  const q = fetchOdata(Account).select("name", "revenue").top(1)
  expect(q.toString()).toBe("$select=name,revenue&$top=1")

  const result = await q.execute()
  expect(result).toHaveLength(1)
  expect(result[0].name).toBe("Litware, Inc. (sample)")
  expect(result[0].revenue).toBe(20000)
})

// ============================================================
// Test 2: filter-rows - Filter on lookup property
// MS Docs: GET .../accounts?$filter=primarycontactid/fullname eq 'Susanna Stubberod (sample)'&$select=name,_primarycontactid_value
// ============================================================
test("MS Docs filter-rows: $filter on lookup property path", async () => {
  server.use(
    http.get(`${API}/accounts`, ({ request }) => {
      const url = new URL(request.url)
      expect(url.searchParams.get("$filter")).toBe("primarycontactid/fullname eq 'Susanna Stubberod (sample)'")
      expect(url.searchParams.get("$select")).toBe("name,_primarycontactid_value")
      return HttpResponse.json({
        "@odata.context": "[Organization URI]/api/data/v9.2/$metadata#accounts(name,_primarycontactid_value)",
        value: [
          {
            "@odata.etag": "W/\"81359849\"",
            name: "Litware, Inc. (sample)",
            _primarycontactid_value: "70bf4d48-34cb-ed11-b596-0022481d68cd",
            accountid: "78914942-34cb-ed11-b596-0022481d68cd",
          },
        ],
      })
    }),
  )

  const q = fetchOdata(Account)
    .select("name", "primaryContactId")
    .where(() => `primarycontactid/fullname eq 'Susanna Stubberod (sample)'`)
  expect(q.toString()).toBe("$select=name,_primarycontactid_value&$filter=primarycontactid/fullname eq 'Susanna Stubberod (sample)'")

  const result = await q.execute()
  expect(result).toHaveLength(1)
  expect(result[0].name).toBe("Litware, Inc. (sample)")
  expect(result[0].primaryContactId).toBe("70bf4d48-34cb-ed11-b596-0022481d68cd")
})

// ============================================================
// Test 3: filter-rows - Nested filter on multi-hop lookup + nested expand
// MS Docs: GET .../accounts?$filter=primarycontactid/createdby/fullname eq 'System Administrator'
//          &$select=name,_primarycontactid_value
//          &$expand=primarycontactid($select=fullname,_createdby_value;$expand=createdby($select=fullname))
//          &$top=1
// ============================================================
test("MS Docs filter-rows: nested filter on multi-hop lookup + nested expand", async () => {
  server.use(
    http.get(`${API}/accounts`, ({ request }) => {
      const url = new URL(request.url)
      expect(url.searchParams.get("$filter")).toBe("primarycontactid/createdby/fullname eq 'System Administrator'")
      expect(url.searchParams.get("$top")).toBe("1")
      return HttpResponse.json({
        "@odata.context": "[Organization URI]/api/data/v9.2/$metadata#accounts(name,_primarycontactid_value,primarycontactid(fullname,_createdby_value,createdby(fullname)))",
        value: [
          {
            "@odata.etag": "W/\"81359849\"",
            name: "Litware, Inc. (sample)",
            _primarycontactid_value: "70bf4d48-34cb-ed11-b596-0022481d68cd",
            accountid: "78914942-34cb-ed11-b596-0022481d68cd",
            primarycontactid: {
              fullname: "Susanna Stubberod (sample)",
              _createdby_value: "4026be43-6b69-e111-8f65-78e7d1620f5e",
              contactid: "70bf4d48-34cb-ed11-b596-0022481d68cd",
              createdby: {
                fullname: "System Administrator",
                systemuserid: "4026be43-6b69-e111-8f65-78e7d1620f5e",
                ownerid: "4026be43-6b69-e111-8f65-78e7d1620f5e",
              },
            },
          },
        ],
      })
    }),
  )

  const q = fetchOdata(Account)
    .select("name", "primaryContactId")
    .top(1)
    .where(() => `primarycontactid/createdby/fullname eq 'System Administrator'`)
    .expand("primaryContact", (sub) =>
      sub
        .select("fullname", "createdById")
        .expand("createdBy", (sub2) => sub2.select("fullname"))
    )
  const s = q.toString()
  expect(s).toContain("$select=name,_primarycontactid_value")
  expect(s).toContain("$filter=primarycontactid/createdby/fullname eq 'System Administrator'")
  expect(s).toContain("$expand=primarycontactid($select=fullname,_createdby_value;$expand=createdby($select=fullname))")
  expect(s).toContain("$top=1")

  const result = await q.execute()
  expect(result).toHaveLength(1)
  expect(result[0].name).toBe("Litware, Inc. (sample)")
  expect(result[0].primaryContact?.fullname).toBe("Susanna Stubberod (sample)")
  expect(result[0].primaryContact?.createdById).toBe("4026be43-6b69-e111-8f65-78e7d1620f5e")
  expect(result[0].primaryContact?.createdBy?.fullname).toBe("System Administrator")
})

// ============================================================
// Test 4: join-tables - Expand single-valued nav properties
// MS Docs: GET .../accounts?$select=name
//          &$expand=primarycontactid($select=contactid,fullname),createdby($select=fullname)
// ============================================================
test("MS Docs join-tables: multi-expand on single-valued nav properties", async () => {
  server.use(
    http.get(`${API}/accounts`, ({ request }) => {
      const url = new URL(request.url)
      expect(url.searchParams.get("$select")).toBe("name")
      expect(url.searchParams.get("$expand")).toBe("primarycontactid($select=contactid,fullname),createdby($select=fullname)")
      return HttpResponse.json({
        "@odata.context": "[Organization URI]/api/data/v9.2/$metadata#accounts(name,primarycontactid(contactid,fullname),createdby(fullname))",
        value: [
          {
            "@odata.etag": "W/\"80649578\"",
            name: "Litware, Inc. (sample)",
            accountid: "78914942-34cb-ed11-b596-0022481d68cd",
            primarycontactid: {
              contactid: "70bf4d48-34cb-ed11-b596-0022481d68cd",
              fullname: "Susanna Stubberod (sample)",
            },
            createdby: {
              fullname: "System Administrator",
              systemuserid: "4026be43-6b69-e111-8f65-78e7d1620f5e",
              ownerid: "4026be43-6b69-e111-8f65-78e7d1620f5e",
            },
          },
        ],
      })
    }),
  )

  const q = fetchOdata(Account)
    .select("name")
    .expand("primaryContact", (sub) => sub.select("contactid", "fullname"))
    .expand("createdBy", (sub) => sub.select("fullname"))
  expect(q.toString()).toBe("$select=name&$expand=primarycontactid($select=contactid,fullname),createdby($select=fullname)")

  const result = await q.execute()
  expect(result).toHaveLength(1)
  expect(result[0].name).toBe("Litware, Inc. (sample)")
  expect(result[0].primaryContact?.contactid).toBe("70bf4d48-34cb-ed11-b596-0022481d68cd")
  expect(result[0].primaryContact?.fullname).toBe("Susanna Stubberod (sample)")
  expect(result[0].createdBy?.fullname).toBe("System Administrator")
})

// ============================================================
// Test 5: join-tables - Nested expand of single-valued nav properties
// MS Docs: GET .../tasks?$select=subject
//          &$expand=regardingobjectid_contact_task($select=fullname;
//           $expand=parentcustomerid_account($select=name;
//            $expand=createdby($select=fullname)))
// ============================================================
test("MS Docs join-tables: deeply nested expand (tasks->contact->account->createdby)", async () => {
  server.use(
    http.get(`${API}/tasks`, ({ request }) => {
      const url = new URL(request.url)
      expect(url.searchParams.get("$select")).toBe("subject")
      return HttpResponse.json({
        "@odata.context": "[Organization URI]/api/data/v9.2/$metadata#tasks(subject,regardingobjectid_contact_task(fullname,parentcustomerid_account(name,createdby(fullname))))",
        value: [
          {
            "@odata.etag": "W/\"80730855\"",
            subject: "Task 1 for Susanna Stubberod",
            activityid: "e9a8c72c-dbcc-ed11-b597-000d3a993550",
            regardingobjectid_contact_task: {
              fullname: "Susanna Stubberod (sample)",
              contactid: "70bf4d48-34cb-ed11-b596-0022481d68cd",
              parentcustomerid_account: {
                name: "Litware, Inc. (sample)",
                accountid: "78914942-34cb-ed11-b596-0022481d68cd",
                createdby: {
                  fullname: "System Administrator",
                  systemuserid: "4026be43-6b69-e111-8f65-78e7d1620f5e",
                  ownerid: "4026be43-6b69-e111-8f65-78e7d1620f5e",
                },
              },
            },
          },
        ],
      })
    }),
  )

  const q = fetchOdata(Task)
    .select("subject")
    .expand("regardingObjectIdContactTask", (sub) =>
      sub
        .select("fullname")
        .expand("parentCustomerIdAccount", (sub2) =>
          sub2
            .select("name")
            .expand("createdBy", (sub3) => sub3.select("fullname"))
        )
    )
  const s = q.toString()
  expect(s).toContain("$select=subject")
  expect(s).toContain("regardingobjectid_contact_task")
  expect(s).toContain("parentcustomerid_account")
  expect(s).toContain("createdby($select=fullname)")

  const result = await q.execute()
  expect(result).toHaveLength(1)
  expect(result[0].subject).toBe("Task 1 for Susanna Stubberod")
  expect(result[0].regardingObjectIdContactTask?.fullname).toBe("Susanna Stubberod (sample)")
  expect(result[0].regardingObjectIdContactTask?.parentCustomerIdAccount?.name).toBe("Litware, Inc. (sample)")
  expect(result[0].regardingObjectIdContactTask?.parentCustomerIdAccount?.createdBy?.fullname).toBe("System Administrator")
})

// ============================================================
// Test 6: join-tables - Collection-valued expand
// MS Docs: GET .../accounts?$select=name,accountid
//          &$expand=Account_Tasks($select=subject),contact_customer_accounts($select=fullname)
// ============================================================
test("MS Docs join-tables: collection-valued expand", async () => {
  server.use(
    http.get(`${API}/accounts`, ({ request }) => {
      const url = new URL(request.url)
      expect(url.searchParams.get("$select")).toBe("name,accountid")
      expect(url.searchParams.get("$expand")).toBe("Account_Tasks($select=subject),contact_customer_accounts($select=fullname)")
      return HttpResponse.json({
        "@odata.context": "[Organization URI]/api/data/v9.2/$metadata#accounts(name,accountid,Account_Tasks(subject),contact_customer_accounts(fullname))",
        value: [
          {
            "@odata.etag": "W/\"80649578\"",
            name: "Litware, Inc. (sample)",
            accountid: "78914942-34cb-ed11-b596-0022481d68cd",
            Account_Tasks: [
              {
                "@odata.etag": "W/\"80730894\"",
                subject: "Task 1 for Litware",
                _regardingobjectid_value: "78914942-34cb-ed11-b596-0022481d68cd",
                activityid: "be9f6557-e2cc-ed11-b597-000d3a993550",
              },
              {
                "@odata.etag": "W/\"80730903\"",
                subject: "Task 2 for Litware",
                _regardingobjectid_value: "78914942-34cb-ed11-b596-0022481d68cd",
                activityid: "605dbd65-e2cc-ed11-b597-000d3a993550",
              },
            ],
            contact_customer_accounts: [
              {
                "@odata.etag": "W/\"80648695\"",
                fullname: "Susanna Stubberod (sample)",
                _parentcustomerid_value: "78914942-34cb-ed11-b596-0022481d68cd",
                contactid: "70bf4d48-34cb-ed11-b596-0022481d68cd",
              },
            ],
          },
        ],
      })
    }),
  )

  const q = fetchOdata(Account)
    .select("name", "accountid")
    .expand("accountTasks", (sub) => sub.select("subject"))
    .expand("contactCustomerAccounts", (sub) => sub.select("fullname"))
  expect(q.toString()).toBe("$select=name,accountid&$expand=Account_Tasks($select=subject),contact_customer_accounts($select=fullname)")

  const result = await q.execute()
  expect(result).toHaveLength(1)
  expect(result[0].name).toBe("Litware, Inc. (sample)")
  expect(result[0].accountTasks).toHaveLength(2)
  expect(result[0].accountTasks[0].subject).toBe("Task 1 for Litware")
  expect(result[0].accountTasks[1].subject).toBe("Task 2 for Litware")
  expect(result[0].contactCustomerAccounts).toHaveLength(1)
  expect(result[0].contactCustomerAccounts[0].fullname).toBe("Susanna Stubberod (sample)")
})

// ============================================================
// Test 7: join-tables - Collection-valued expand WITH nested expand
// MS Docs: GET .../accounts?$select=name,accountid
//          &$expand=Account_Tasks($select=subject),contact_customer_accounts($select=fullname;
//           $expand=owninguser($select=fullname))
// ============================================================
test("MS Docs join-tables: collection-valued expand with nested expand", async () => {
  server.use(
    http.get(`${API}/accounts`, ({ request }) => {
      const url = new URL(request.url)
      expect(url.searchParams.get("$expand")).toContain("Account_Tasks($select=subject)")
      expect(url.searchParams.get("$expand")).toContain("contact_customer_accounts($select=fullname;$expand=owninguser($select=fullname))")
      return HttpResponse.json({
        "@odata.context": "[Organization URI]/api/data/v9.2/$metadata#accounts(name,accountid,Account_Tasks(subject),contact_customer_accounts(fullname,owninguser(fullname)))",
        value: [
          {
            "@odata.etag": "W/\"80649578\"",
            name: "Litware, Inc. (sample)",
            accountid: "78914942-34cb-ed11-b596-0022481d68cd",
            Account_Tasks: [
              {
                subject: "Task 1 for Litware",
                activityid: "be9f6557-e2cc-ed11-b597-000d3a993550",
              },
            ],
            contact_customer_accounts: [
              {
                fullname: "Susanna Stubberod (sample)",
                contactid: "70bf4d48-34cb-ed11-b596-0022481d68cd",
                owninguser: {
                  fullname: "System Administrator",
                  systemuserid: "4026be43-6b69-e111-8f65-78e7d1620f5e",
                  ownerid: "4026be43-6b69-e111-8f65-78e7d1620f5e",
                },
              },
            ],
          },
        ],
      })
    }),
  )

  const q = fetchOdata(Account)
    .select("name", "accountid")
    .expand("accountTasks", (sub) => sub.select("subject"))
    .expand("contactCustomerAccounts", (sub) =>
      sub
        .select("fullname")
        .expand("owningUser", (sub2) => sub2.select("fullname"))
    )
  const s = q.toString()
  expect(s).toContain("Account_Tasks($select=subject)")
  expect(s).toContain("contact_customer_accounts($select=fullname;$expand=owninguser($select=fullname))")

  const result = await q.execute()
  expect(result).toHaveLength(1)
  expect(result[0].accountTasks).toHaveLength(1)
  expect(result[0].accountTasks[0].subject).toBe("Task 1 for Litware")
  expect(result[0].contactCustomerAccounts).toHaveLength(1)
  expect(result[0].contactCustomerAccounts[0].fullname).toBe("Susanna Stubberod (sample)")
  expect(result[0].contactCustomerAccounts[0].owningUser?.fullname).toBe("System Administrator")
})

// ============================================================
// Unsupported MS Docs examples (not yet implemented):
// ============================================================
// - $expand=primarycontactid/$ref — reference-only expand (not implemented)
// - Formatted values via Prefer: odata.include-annotations header (not implemented)
// - Lookup property annotations via Prefer headers (not implemented)
// - Parameter aliases (@p1, @p2) for filter values (not implemented)
// - $count=true (not implemented)
// - Prefer: odata.maxpagesize header (not implemented)
// - If-None-Match header (not implemented)
// - $apply with filter(...)/groupby(...) chaining (not implemented)
