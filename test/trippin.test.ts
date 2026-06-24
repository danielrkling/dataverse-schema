import { expect, test } from "vitest"
import { DataverseClient } from "../src/client"
import { fetchOdata, eq, ne, gt, contains, and } from "../src"
import { DataverseTable, primaryKey, string, number, collection } from "../src"

const TRIPPIN_URL = "https://services.odata.org/TripPinRESTierService"

const client = new DataverseClient({ url: TRIPPIN_URL })

const TrippinTrip = new DataverseTable({
  client, entitySetName: "trippin_trips", logicalName: "trippin_trips",
  fields: {
    tripId: primaryKey("TripId"),
    name: string("Name"),
    budget: number("Budget"),
  },
})

const TrippinPerson = new DataverseTable({
  client, entitySetName: "People", logicalName: "People",
  fields: {
    userName: primaryKey("UserName"),
    firstName: string("FirstName"),
    lastName: string("LastName"),
    age: number("Age"),
    gender: string("Gender"),
    trips: collection("Trips", () => TrippinTrip),
  },
})

const TrippinAirline = new DataverseTable({
  client, entitySetName: "Airlines", logicalName: "Airlines",
  fields: {
    airlineCode: primaryKey("AirlineCode"),
    name: string("Name"),
  },
})

async function trippinFetch<T = unknown>(path: string, queryString?: string): Promise<T> {
  const url = queryString
    ? `${TRIPPIN_URL}/${path}?${queryString}`
    : `${TRIPPIN_URL}/${path}`
  const res = await fetch(url, { headers: { Accept: "application/json" } })
  if (!res.ok) {
    throw new Error(`TripPin returned ${res.status}: ${await res.text()}`)
  }
  return res.json()
}

test("TripPin: service is reachable", async () => {
  const data = await trippinFetch<{ value: unknown[] }>("People", "$top=1")
  expect(data.value).toHaveLength(1)
})

test("TripPin: select + top returns correct fields", async () => {
  const q = fetchOdata(TrippinPerson)
    .select("userName", "firstName", "lastName")
    .top(2)
  const data = await trippinFetch<{ value: Record<string, unknown>[] }>("People", q.toString())
  expect(data.value).toHaveLength(2)
  for (const p of data.value) {
    expect(p).toHaveProperty("UserName")
    expect(p).toHaveProperty("FirstName")
    expect(p).toHaveProperty("LastName")
    expect(p).not.toHaveProperty("Age")
    expect(p).not.toHaveProperty("Gender")
  }
})

test("TripPin: filter by gender enum", async () => {
  const q = fetchOdata(TrippinPerson)
    .filter(f => eq(f.gender, "Female"))
    .select("userName", "gender")
    .top(3)
  const data = await trippinFetch<{ value: Record<string, unknown>[] }>("People", q.toString())
  expect(data.value.length).toBeGreaterThan(0)
  for (const p of data.value) {
    expect(p.Gender).toBe("Female")
  }
})

test("TripPin: orderby lastName descending", async () => {
  const q = fetchOdata(TrippinPerson)
    .select("lastName")
    .orderby(f => f.lastName, "desc")
    .top(3)
  const data = await trippinFetch<{ value: Record<string, unknown>[] }>("People", q.toString())
  expect(data.value).toHaveLength(3)
  const lastNames = data.value.map(p => p.LastName as string)
  expect(lastNames[0] >= lastNames[1]).toBe(true)
})

test("TripPin: filter age not null", async () => {
  const q = fetchOdata(TrippinPerson)
    .select("userName", "age")
    .filter(f => ne(f.age, null))
    .top(5)
  const data = await trippinFetch<{ value: Record<string, unknown>[] }>("People", q.toString())
  for (const p of data.value) {
    expect(p.Age).not.toBeNull()
  }
})

test("TripPin: contains on FirstName string field", async () => {
  const q = fetchOdata(TrippinPerson)
    .select("firstName")
    .filter(f => contains(f.firstName, "Russell"))
  const data = await trippinFetch<{ value: Record<string, unknown>[] }>("People", q.toString())
  expect(data.value.length).toBeGreaterThan(0)
  for (const p of data.value) {
    expect((p.FirstName as string).toLowerCase()).toContain("russell")
  }
})

test("TripPin: filter by first AND last name", async () => {
  const q = fetchOdata(TrippinPerson)
    .select("userName", "firstName", "lastName")
    .filter(f => and(eq(f.firstName, "Russell"), eq(f.lastName, "Whyte")))
  const data = await trippinFetch<{ value: Record<string, unknown>[] }>("People", q.toString())
  expect(data.value.length).toBeGreaterThanOrEqual(1)
  expect(data.value[0].FirstName).toBe("Russell")
  expect(data.value[0].LastName).toBe("Whyte")
})

test("TripPin: expand trips navigation property", async () => {
  const q = fetchOdata(TrippinPerson)
    .select("userName", "firstName")
    .expand("trips", sub => sub.select("name", "budget"))
  const data = await trippinFetch<{ value: Record<string, unknown>[] }>(
    "People",
    q.toString(),
  )
  expect(data.value.length).toBeGreaterThan(0)
  const person = data.value[0] as Record<string, unknown>
  expect(person).toHaveProperty("Trips")
  expect(Array.isArray(person.Trips)).toBe(true)
  if ((person.Trips as unknown[]).length > 0) {
    const trip = (person.Trips as Record<string, unknown>[])[0]
    expect(trip).toHaveProperty("Name")
    expect(trip).toHaveProperty("Budget")
  }
})

test("TripPin: Airlines entity set", async () => {
  const q = fetchOdata(TrippinAirline)
    .select("airlineCode", "name")
    .top(3)
  const data = await trippinFetch<{ value: Record<string, unknown>[] }>("Airlines", q.toString())
  expect(data.value.length).toBeGreaterThanOrEqual(3)
  expect(data.value[0]).toHaveProperty("AirlineCode")
  expect(data.value[0]).toHaveProperty("Name")
})

test("TripPin: combined query (filter + orderby + top + select)", async () => {
  const q = fetchOdata(TrippinPerson)
    .select("firstName", "lastName", "age")
    .filter(f => gt(f.age, 30))
    .orderby(f => f.lastName)
    .top(5)
  const data = await trippinFetch<{ value: Record<string, unknown>[] }>("People", q.toString())
  for (const p of data.value) {
    expect(Number(p.Age)).toBeGreaterThan(30)
  }
})

test("TripPin: default select includes all fields", async () => {
  const q = fetchOdata(TrippinPerson).top(1)
  const data = await trippinFetch<{ value: Record<string, unknown>[] }>("People", q.toString())
  expect(data.value).toHaveLength(1)
  const person = data.value[0]
  expect(person).toHaveProperty("UserName")
  expect(person).toHaveProperty("FirstName")
  expect(person).toHaveProperty("LastName")
  expect(person).toHaveProperty("Gender")
})
