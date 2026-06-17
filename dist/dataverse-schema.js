const Etag = Symbol("etag");
function attachEtag(v) {
  if (v && typeof v === "object")
    v[Etag] = v["@odata.etag"];
  return v;
}
function getEtag(v) {
  return v?.[Etag];
}
function mergeRecords(prevRecords, newRecords) {
  const prevMap = new Map(prevRecords.map((v) => [v[Etag], v]));
  return newRecords.map((v) => prevMap.get(v[Etag]) ?? v);
}
function xml(raw, ...values) {
  return String.raw(raw, values).trim().replace(/>\s+</g, "><");
}
function toBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => {
      const url = reader.result;
      const index = url?.toString().indexOf("base64") ?? 0;
      resolve(url?.slice(index + 7));
    };
    reader.onerror = reject;
  });
}
function base64ImageToURL(base64) {
  return `data:${detectImageType(base64)};base64,${base64}`;
}
function detectImageType(base64) {
  if (base64.startsWith("iVBORw0KGgoAAAANSUhEUgAA")) {
    return "image/png";
  } else if (base64.startsWith("/9j/4AAQSkZJRgABAQEAYABgAAD/")) {
    return "image/jpeg";
  } else if (base64.startsWith("R0lGODlh")) {
    return "image/gif";
  } else {
    return "image/png";
  }
}
function getImageUrl(entity, name, id) {
  return `${location.origin}/Image/download.aspx?Entity=${entity}&Attribute=${name}&Id=${id}&Full=true`;
}
function parseDateOnly(dateString) {
  const [year, month, day] = dateString.slice(0, 10).split("-").map(Number);
  return new Date(year ?? 0, (month ?? 0) - 1, day);
}
function toDateOnly(date) {
  try {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  } catch (e) {
    return null;
  }
}
function getName(name) {
  if (typeof name === "string") return name;
  if ("name" in name) return name.name;
  if (typeof name.toString === "function") return name.toString();
  return String(name);
}

function isNonEmptyString(value) {
  return typeof value === "string" && value.length > 0;
}
const rxGUID = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/i;
const rxDateOnly = /^\d{4}-\d{2}-\d{2}$/;
function wrapString(value) {
  if (value === null) return "null";
  if (typeof value === "string") {
    if (rxGUID.test(value) || rxDateOnly.test(value)) {
      return value;
    }
    return `'${value.replace(/'/g, "''")}'`;
  }
  return String(value);
}
function query(queryObj) {
  const params = new URLSearchParams();
  if (queryObj.select) params.set("$select", queryObj.select);
  if (queryObj.expand) params.set("$expand", queryObj.expand);
  if (queryObj.orderby) params.set("$orderby", queryObj.orderby);
  if (queryObj.filter) params.set("$filter", queryObj.filter);
  if (queryObj.top) params.set("$top", queryObj.top.toFixed(0));
  if (queryObj.apply) params.set("$apply", queryObj.apply);
  return params.toString();
}
function fetchXML(xml) {
  return `fetchXml=${xml.trim().replace(/>\s+</g, "><")}`;
}
function select(...values) {
  return values.map(getName).filter(isNonEmptyString).join(",");
}
function orderby(values) {
  if (Array.isArray(values)) return values.filter(isNonEmptyString).join(",");
  return Object.entries(values).filter(([, v]) => isNonEmptyString(v)).map(([k, v]) => `${k} ${v}`).join(",");
}
class OrderSpec {
  constructor(fields, direction) {
    this.fields = fields;
    this.direction = direction;
  }
  toString() {
    return this.fields.map((f) => `${f} ${this.direction}`).join(",");
  }
}
function asc(...fields) {
  return new OrderSpec(fields.map(getName), "asc");
}
function desc(...fields) {
  return new OrderSpec(fields.map(getName), "desc");
}
function keys(keyValues) {
  return Object.entries(keyValues).filter(([, v]) => isNonEmptyString(String(v))).map(([k, v]) => `${k}=${wrapString(v)}`).join(",");
}
function expand(values) {
  if (typeof values === "string") return values;
  return Object.entries(values).map(([name, v]) => {
    if (typeof v === "string") return v;
    const expandParts = [];
    if (v.select)
      expandParts.push(
        `$select=${select(...Array.isArray(v.select) ? v.select : [v.select])}`
      );
    if (v.filter) expandParts.push(`$filter=${v.filter}`);
    if (v.orderby) expandParts.push(`$orderby=${orderby(v.orderby)}`);
    if (v.expand) expandParts.push(`$expand=${expand(v.expand)}`);
    return `${name}(${expandParts.join(";")})`;
  }).join(",");
}
function and(...conditions) {
  const valid = conditions.filter(isNonEmptyString);
  return valid.length === 0 ? "" : `(${valid.join(" and ")})`;
}
function or(...conditions) {
  const valid = conditions.filter(isNonEmptyString);
  return valid.length === 0 ? "" : `(${valid.join(" or ")})`;
}
function not(condition) {
  return isNonEmptyString(condition) ? `not(${condition})` : "";
}
function contains(field, value) {
  return `contains(${getName(field)},${wrapString(value)})`;
}
function startsWith(field, value) {
  return `startswith(${getName(field)},${wrapString(value)})`;
}
function endsWith(field, value) {
  return `endswith(${getName(field)},${wrapString(value)})`;
}
function equals(field, value) {
  return `(${getName(field)} eq ${wrapString(value)})`;
}
function notEquals(field, value) {
  return `(${getName(field)} ne ${wrapString(value)})`;
}
function greaterThan(field, value) {
  return `(${getName(field)} gt ${wrapString(value)})`;
}
function greaterThanOrEqual(field, value) {
  return `(${getName(field)} ge ${wrapString(value)})`;
}
function lessThan(field, value) {
  return `(${getName(field)} lt ${wrapString(value)})`;
}
function lessThanOrEqual(field, value) {
  return `(${getName(field)} le ${wrapString(value)})`;
}
function isActive() {
  return "statecode eq 0";
}
function isInactive() {
  return "statecode eq 1";
}
function isNull(field) {
  return `${getName(field)} eq null`;
}
function isNotNull(field) {
  return `${getName(field)} ne null`;
}
function groupby(values, aggregations) {
  return `groupby((${values.map(getName).filter(isNonEmptyString).join(",")})${aggregations ? "," + aggregations : ""})`;
}
function aggregate(...values) {
  return `aggregate(${values.filter(isNonEmptyString).join(",")})`;
}
function average(field, alias) {
  const name = getName(field);
  return `${name} with average as ${alias ?? name}`;
}
function sum(field, alias) {
  const name = getName(field);
  return `${name} with sum as ${alias ?? name}`;
}
function min(field, alias) {
  const name = getName(field);
  return `${name} with min as ${alias ?? name}`;
}
function max(field, alias) {
  const name = getName(field);
  return `${name} with max as ${alias ?? name}`;
}
function count(alias = "count") {
  return `$count as ${alias}`;
}
const Above = (field, value) => `Microsoft.Dynamics.CRM.Above(PropertyName=${getName(field)},PropertyValue=${wrapString(value)})`;
const AboveOrEqual = (field, value) => `Microsoft.Dynamics.CRM.AboveOrEqual(PropertyName=${getName(field)},PropertyValue=${wrapString(value)})`;
const Between = (field, value1, value2) => `Microsoft.Dynamics.CRM.Between(PropertyName=${getName(field)},PropertyValues=[${wrapString(value1)},${wrapString(value2)}])`;
const ContainsValues = (field, values) => `Microsoft.Dynamics.CRM.ContainsValues(PropertyName=${getName(field)},PropertyValues=[${values.map(wrapString).join(",")}])`;
const DoesNotContainValues = (field, values) => `Microsoft.Dynamics.CRM.DoesNotContainValues(PropertyName=${getName(field)},PropertyValues=[${values.map(wrapString).join(",")}])`;
const EqualBusinessId = (field) => `Microsoft.Dynamics.CRM.EqualBusinessId(PropertyName=${getName(field)})`;
const EqualUserId = (field) => `Microsoft.Dynamics.CRM.EqualUserId(PropertyName=${wrapString(getName(field))})`;
const EqualUserLanguage = (field) => `Microsoft.Dynamics.CRM.EqualUserLanguage(PropertyName=${getName(field)})`;
const EqualUserOrUserHierarchy = (field) => `Microsoft.Dynamics.CRM.EqualUserOrUserHierarchy(PropertyName=${getName(field)})`;
const EqualUserOrUserHierarchyAndTeams = (field) => `Microsoft.Dynamics.CRM.EqualUserOrUserHierarchyAndTeams(PropertyName=${getName(field)})`;
const EqualUserOrUserTeams = (field) => `Microsoft.Dynamics.CRM.EqualUserOrUserTeams(PropertyName=${getName(field)})`;
const In = (field, values) => `Microsoft.Dynamics.CRM.In(PropertyName=${getName(field)},PropertyValues=[${values.map(wrapString).join(",")}])`;
const InFiscalPeriod = (field, value) => `Microsoft.Dynamics.CRM.InFiscalPeriod(PropertyName=${getName(field)},PropertyValue=${value})`;
const InFiscalPeriodAndYear = (field, fiscalPeriod, fiscalYear) => `Microsoft.Dynamics.CRM.InFiscalPeriodAndYear(PropertyName=${getName(field)},PropertyValue1=${fiscalPeriod},PropertyValue2=${fiscalYear})`;
const InFiscalYear = (field, value) => `Microsoft.Dynamics.CRM.InFiscalYear(PropertyName=${getName(field)},PropertyValue=${value})`;
const InOrAfterFiscalPeriodAndYear = (field, fiscalPeriod, fiscalYear) => `Microsoft.Dynamics.CRM.InOrAfterFiscalPeriodAndYear(PropertyName=${getName(field)},PropertyValue1=${fiscalPeriod},PropertyValue2=${fiscalYear})`;
const InOrBeforeFiscalPeriodAndYear = (field, fiscalPeriod, fiscalYear) => `Microsoft.Dynamics.CRM.InOrBeforeFiscalPeriodAndYear(PropertyName=${getName(field)},PropertyValue1=${fiscalPeriod},PropertyValue2=${fiscalYear})`;
const Last7Days = (field) => `Microsoft.Dynamics.CRM.Last7Days(PropertyName=${getName(field)})`;
const LastFiscalPeriod = (field) => `Microsoft.Dynamics.CRM.LastFiscalPeriod(PropertyName=${getName(field)})`;
const LastFiscalYear = (field) => `Microsoft.Dynamics.CRM.LastFiscalYear(PropertyName=${getName(field)})`;
const LastMonth = (field) => `Microsoft.Dynamics.CRM.LastMonth(PropertyName=${getName(field)})`;
const LastWeek = (field) => `Microsoft.Dynamics.CRM.LastWeek(PropertyName=${getName(field)})`;
const LastXDays = (field, value) => `Microsoft.Dynamics.CRM.LastXDays(PropertyName=${getName(field)},PropertyValue=${value})`;
const LastXFiscalPeriods = (field, value) => `Microsoft.Dynamics.CRM.LastXFiscalPeriods(PropertyName=${getName(field)},PropertyValue=${value})`;
const LastXFiscalYears = (field, value) => `Microsoft.Dynamics.CRM.LastXFiscalYears(PropertyName=${getName(field)},PropertyValue=${value})`;
const LastXHours = (field, value) => `Microsoft.Dynamics.CRM.LastXHours(PropertyName=${getName(field)},PropertyValue=${value})`;
const LastXMonths = (field, value) => `Microsoft.Dynamics.CRM.LastXMonths(PropertyName=${getName(field)},PropertyValue=${value})`;
const LastXWeeks = (field, value) => `Microsoft.Dynamics.CRM.LastXWeeks(PropertyName=${getName(field)},PropertyValue=${value})`;
const LastXYears = (field, value) => `Microsoft.Dynamics.CRM.LastXYears(PropertyName=${getName(field)},PropertyValue=${value})`;
const LastYear = (field) => `Microsoft.Dynamics.CRM.LastYear(PropertyName=${getName(field)})`;
const Next7Days = (field) => `Microsoft.Dynamics.CRM.Next7Days(PropertyName=${getName(field)})`;
const NextFiscalPeriod = (field) => `Microsoft.Dynamics.CRM.NextFiscalPeriod(PropertyName=${getName(field)})`;
const NextFiscalYear = (field) => `Microsoft.Dynamics.CRM.NextFiscalYear(PropertyName=${getName(field)})`;
const NextMonth = (field) => `Microsoft.Dynamics.CRM.NextMonth(PropertyName=${getName(field)})`;
const NextWeek = (field) => `Microsoft.Dynamics.CRM.NextWeek(PropertyName=${getName(field)})`;
const NextXDays = (field, value) => `Microsoft.Dynamics.CRM.NextXDays(PropertyName=${getName(field)},PropertyValue=${value})`;
const NextXFiscalPeriods = (field, value) => `Microsoft.Dynamics.CRM.NextXFiscalPeriods(PropertyName=${getName(field)},PropertyValue=${value})`;
const NextXFiscalYears = (field, value) => `Microsoft.Dynamics.CRM.NextXFiscalYears(PropertyName=${getName(field)},PropertyValue=${value})`;
const NextXHours = (field, value) => `Microsoft.Dynamics.CRM.NextXHours(PropertyName=${getName(field)},PropertyValue=${value})`;
const NextXMonths = (field, value) => `Microsoft.Dynamics.CRM.NextXMonths(PropertyName=${getName(field)},PropertyValue=${value})`;
const NextXWeeks = (field, value) => `Microsoft.Dynamics.CRM.NextXWeeks(PropertyName=${getName(field)},PropertyValue=${value})`;
const NextXYears = (field, value) => `Microsoft.Dynamics.CRM.NextXYears(PropertyName=${getName(field)},PropertyValue=${value})`;
const NextYear = (field) => `Microsoft.Dynamics.CRM.NextYear(PropertyName=${getName(field)})`;
const NotBetween = (field, value1, value2) => `Microsoft.Dynamics.CRM.NotBetween(PropertyName=${getName(field)},PropertyValues=[${wrapString(value1)},${wrapString(value2)}])`;
const NotEqualBusinessId = (field) => `Microsoft.Dynamics.CRM.NotEqualBusinessId(PropertyName=${getName(field)})`;
const NotEqualUserId = (field) => `Microsoft.Dynamics.CRM.NotEqualUserId(PropertyName=${getName(field)})`;
const NotIn = (field, values) => `Microsoft.Dynamics.CRM.NotIn(PropertyName=${getName(field)},PropertyValues=[${values.map(wrapString).join(",")}])`;
const NotUnder = (field, value) => `Microsoft.Dynamics.CRM.NotUnder(PropertyName=${getName(field)},PropertyValue=${wrapString(value)})`;
const OlderThanXDays = (field, value) => `Microsoft.Dynamics.CRM.OlderThanXDays(PropertyName=${getName(field)},PropertyValue=${value})`;
const OlderThanXHours = (field, value) => `Microsoft.Dynamics.CRM.OlderThanXHours(PropertyName=${getName(field)},PropertyValue=${value})`;
const OlderThanXMinutes = (field, value) => `Microsoft.Dynamics.CRM.OlderThanXMinutes(PropertyName=${getName(field)},PropertyValue=${value})`;
const OlderThanXMonths = (field, value) => `Microsoft.Dynamics.CRM.OlderThanXMonths(PropertyName=${getName(field)},PropertyValue=${value})`;
const OlderThanXWeeks = (field, value) => `Microsoft.Dynamics.CRM.OlderThanXWeeks(PropertyName=${getName(field)},PropertyValue=${value})`;
const OlderThanXYears = (field, value) => `Microsoft.Dynamics.CRM.OlderThanXYears(PropertyName=${getName(field)},PropertyValue=${value})`;
const On = (field, value) => `Microsoft.Dynamics.CRM.On(PropertyName=${getName(field)},PropertyValue=${wrapString(value)})`;
const OnOrAfter = (field, value) => `Microsoft.Dynamics.CRM.OnOrAfter(PropertyName=${getName(field)},PropertyValue=${wrapString(value)})`;
const OnOrBefore = (field, value) => `Microsoft.Dynamics.CRM.OnOrBefore(PropertyName=${getName(field)},PropertyValue=${wrapString(value)})`;
const ThisFiscalPeriod = (field) => `Microsoft.Dynamics.CRM.ThisFiscalPeriod(PropertyName=${getName(field)})`;
const ThisFiscalYear = (field) => `Microsoft.Dynamics.CRM.ThisFiscalYear(PropertyName=${getName(field)})`;
const ThisMonth = (field) => `Microsoft.Dynamics.CRM.ThisMonth(PropertyName=${getName(field)})`;
const ThisWeek = (field) => `Microsoft.Dynamics.CRM.ThisWeek(PropertyName=${getName(field)})`;
const ThisYear = (field) => `Microsoft.Dynamics.CRM.ThisYear(PropertyName=${getName(field)})`;
const Today = (field) => `Microsoft.Dynamics.CRM.Today(PropertyName=${getName(field)})`;
const Tomorrow = (field) => `Microsoft.Dynamics.CRM.Tomorrow(PropertyName=${getName(field)})`;
const Under = (field, value) => `Microsoft.Dynamics.CRM.Under(PropertyName=${getName(field)},PropertyValue=${wrapString(value)})`;
const UnderOrEqual = (field, value) => `Microsoft.Dynamics.CRM.UnderOrEqual(PropertyName=${getName(field)},PropertyValue=${wrapString(value)})`;
const Yesterday = (field) => `Microsoft.Dynamics.CRM.Yesterday(PropertyName=${getName(field)})`;
function any(collectionProperty, alias, condition) {
  return `${getName(collectionProperty)}/any(${alias}: ${condition})`;
}
function all(collectionProperty, alias, condition) {
  return `${getName(collectionProperty)}/all(${alias}: ${condition})`;
}
function compare(field, operator, otherField) {
  return `(${getName(field)} ${operator} ${getName(otherField)})`;
}

const parenthesesRegEx = /\(([^)]+)\)/;
class DataverseClient {
  options;
  /** @param options Connection and authentication options. */
  constructor(options = {}) {
    this.options = {
      url: location.origin,
      ...options
    };
  }
  /**
   * Core HTTP fetch method for all Dataverse API calls.
   * Automatically prepends the API base path, applies auth headers,
   * handles 204/304 responses, and extracts OData-EntityId from POST headers.
   *
   * @example
   * await client.fetch("accounts?$select=name&$top=5")
   *
   * @example
   * await client.fetch("accounts", {
   *   method: "POST",
   *   body: JSON.stringify({ name: "New Account" }),
   * })
   */
  async fetch(resource, options = {}) {
    if (this._processChangeset(resource, options)) return;
    if (this._processBatch(resource, options)) return;
    const url = resource.startsWith("http") ? resource : `${this.options.url}/api/data/v9.2/${resource}`;
    const { headers, impersonateByAAId, impersonateByUserId, token } = this.options;
    const response = await fetch(url, {
      ...options,
      headers: {
        "OData-MaxVersion": "4.0",
        "OData-Version": "4.0",
        Accept: "application/json",
        "Content-Type": "application/json; charset=utf-8",
        "If-None-Match": "null",
        ...impersonateByUserId ? { MSCRMCallerID: impersonateByUserId } : {},
        ...impersonateByAAId ? { CallerObjectId: impersonateByAAId } : {},
        ...token ? { Authorization: `Bearer ${token}` } : {},
        ...headers,
        ...options.headers
      }
    });
    if (response.status === 204) {
      const entityId = response.headers.get("OData-EntityId");
      if (entityId) return parenthesesRegEx.exec(entityId)?.[1];
      return;
    }
    if (response.status === 304) {
      return null;
    }
    if (response.headers.get("Content-Type")?.includes("application/json")) {
      const data = await response.json();
      if (data.error) {
        if (data.error.code === "0x80060891") return null;
        throw data.error;
      }
      return data;
    }
    if (!response.ok) {
      throw new Error(response.status + "-" + response.statusText);
    }
    return await response.text();
  }
  //
  // --- PRIVATE HELPER METHODS ---
  //
  async _getNextLink(result) {
    if (result["@odata.nextLink"]) {
      const nextResult = await this.fetch(result["@odata.nextLink"]);
      const recursiveResults = await this._getNextLink(nextResult);
      return [...result.value, ...recursiveResults];
    }
    return result.value;
  }
  //
  // --- PUBLIC API METHODS ---
  //
  /**
   * Retrieves a single record by ID.
   *
   * @example
   * const account = await client.getRecord("accounts", "00000000-0000-0000-0000-000000000001",
   *   "$select=name,revenue")
   */
  async getRecord(entitySetName, id, query = "", etag) {
    const resource = `${getName(entitySetName)}(${id})?${query}`;
    if (etag) {
      return this.fetch(resource, { headers: { "If-None-Match": etag } });
    }
    return this.fetch(resource);
  }
  /**
   * Retrieves multiple records, automatically following `@odata.nextLink` pagination.
   *
   * @example
   * const accounts = await client.getRecords("accounts",
   *   "$select=name,revenue&$filter=revenue gt 10000")
   */
  async getRecords(entitySetName, query = "") {
    const resource = `${entitySetName}?${query}`;
    return this.fetch(resource).then((r) => this._getNextLink(r));
  }
  /**
   * Creates a record and returns its full representation.
   *
   * @example
   * const newAccount = await client.postRecord("accounts",
   *   { name: "New Account", revenue: 50000 })
   */
  async postRecord(entitySetName, value, query = "") {
    return this.fetch(`${getName(entitySetName)}?${query}`, {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify(value)
    });
  }
  /**
   * Creates a record and returns only its GUID (no Prefer header).
   *
   * @example
   * const id = await client.postRecordGetId("accounts",
   *   { name: "New Account" })
   * // id: "00000000-0000-0000-0000-000000000001"
   */
  async postRecordGetId(entitySetName, value) {
    return this.fetch(getName(entitySetName), {
      method: "POST",
      body: JSON.stringify(value)
    });
  }
  /**
   * Updates an existing record (partial update via PATCH).
   *
   * @example
   * await client.patchRecord("accounts", "00000000-0000-0000-0000-000000000001",
   *   { name: "Updated Name", revenue: 75000 })
   */
  async patchRecord(entitySetName, id, value, query = "", etag) {
    const extraHeaders = { Prefer: "return=representation" };
    if (etag) extraHeaders["If-Match"] = etag;
    return this.fetch(`${getName(entitySetName)}(${id})?${query}`, {
      method: "PATCH",
      headers: extraHeaders,
      body: JSON.stringify(value)
    });
  }
  /**
   * Deletes a record by ID.
   *
   * @example
   * const deletedId = await client.deleteRecord("accounts",
   *   "00000000-0000-0000-0000-000000000001")
   */
  async deleteRecord(entitySetName, id, etag) {
    const options = { method: "DELETE" };
    if (etag) options.headers = { "If-Match": etag };
    await this.fetch(`${getName(entitySetName)}(${id})`, options);
    return id;
  }
  /**
   * Updates a single property value via PUT.
   *
   * @example
   * await client.updatePropertyValue("accounts",
   *   "00000000-0000-0000-0000-000000000001", "name", "New Name")
   */
  async updatePropertyValue(entitySetName, id, propertyName, value, etag) {
    const options = {
      method: "PUT",
      body: JSON.stringify({ value })
    };
    if (etag) options.headers = { "If-Match": etag };
    await this.fetch(`${getName(entitySetName)}(${id})/${getName(propertyName)}`, options);
    return id;
  }
  /**
   * Deletes (nulls out) a single property value.
   *
   * @example
   * await client.deletePropertyValue("accounts",
   *   "00000000-0000-0000-0000-000000000001", "emailaddress1")
   */
  async deletePropertyValue(entitySetName, id, propertyName) {
    await this.fetch(`${getName(entitySetName)}(${id})/${getName(propertyName)}`, {
      method: "DELETE"
    });
    return id;
  }
  /**
   * Retrieves a single property value.
   *
   * @example
   * const name = await client.getPropertyValue("accounts",
   *   "00000000-0000-0000-0000-000000000001", "name")
   */
  async getPropertyValue(entitySetName, id, propertyName) {
    return this.fetch(`${getName(entitySetName)}(${id})/${getName(propertyName)}`).then((r) => r.value);
  }
  /**
   * Retrieves a property's raw value (e.g. file content) via `/$value`.
   *
   * @example
   * const imageData = await client.getPropertyRawValue("accounts",
   *   "00000000-0000-0000-0000-000000000001", "entityimage")
   */
  async getPropertyRawValue(entitySetName, id, propertyName) {
    return this.fetch(`${getName(entitySetName)}(${id})/${getName(propertyName)}/$value`);
  }
  /**
   * Returns the URL for a property's raw value.
   *
   * @example
   * const url = client.getPropertyRawValueURL("accounts",
   *   "00000000-0000-0000-0000-000000000001", "entityimage")
   */
  getPropertyRawValueURL(entitySetName, id, propertyName) {
    return `${this.options.url}/api/data/v9.2/${getName(entitySetName)}(${id})/${getName(propertyName)}/$value`;
  }
  /**
   * Returns the full-size image download URL.
   *
   * @example
   * const url = client.getImageFullSizeURL("accounts",
   *   "00000000-0000-0000-0000-000000000001", "entityimage")
   */
  getImageFullSizeURL(entitySetName, id, propertyName) {
    return `${this.options.url}/api/data/v9.2/${getName(entitySetName)}(${id})/${getName(propertyName)}/$value?size=full`;
  }
  /**
   * Returns the legacy image download URL.
   *
   * @example
   * const url = client.getImageDownloadURL("accounts",
   *   "00000000-0000-0000-0000-000000000001", "entityimage")
   */
  getImageDownloadURL(entitySetName, id, propertyName) {
    return `${this.options.url}/Image/download.aspx?Entity=${getName(entitySetName)}&Attribute=${getName(propertyName)}&Id=${id}&Full=true`;
  }
  /**
   * Uploads a file to a file property.
   *
   * @example
   * await client.updateFileProperty("accounts",
   *   "00000000-0000-0000-0000-000000000001",
   *   "myfile", "report.pdf", fileBlob)
   */
  async updateFileProperty(entitySetName, id, propertyName, filename, body) {
    return this.fetch(`${getName(entitySetName)}(${id})/${getName(propertyName)}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/octet-stream",
        "x-ms-file-name": filename
      },
      body
    });
  }
  /**
   * Activates a record (sets statecode to 0).
   *
   * @example
   * await client.activateRecord("accounts",
   *   "00000000-0000-0000-0000-000000000001")
   */
  async activateRecord(entitySetName, id) {
    return this.updatePropertyValue(entitySetName, id, "statecode", 0);
  }
  /**
   * Deactivates a record (sets statecode to 1).
   *
   * @example
   * await client.deactivateRecord("accounts",
   *   "00000000-0000-0000-0000-000000000001")
   */
  async deactivateRecord(entitySetName, id) {
    return this.updatePropertyValue(entitySetName, id, "statecode", 1);
  }
  /**
   * Associates two records via a navigation property.
   *
   * @example
   * await client.associateRecord("accounts",
   *   "00000000-0000-0000-0000-000000000001",
   *   "primarycontactid",
   *   "contacts",
   *   "00000000-0000-0000-0000-000000000002")
   */
  async associateRecord(entitySetName, parentId, propertyName, childEntitySetName, childId) {
    await this.fetch(`${getName(entitySetName)}(${parentId})/${getName(propertyName)}/$ref`, {
      method: "PUT",
      body: JSON.stringify({
        "@odata.id": `${this.options.url}/api/data/v9.2/${getName(childEntitySetName)}(${childId})`
      })
    });
    return childId;
  }
  /**
   * Dissociates two records. If childId is omitted, all references are removed.
   *
   * @example
   * await client.dissociateRecord("accounts",
   *   "00000000-0000-0000-0000-000000000001",
   *   "primarycontactid",
   *   "00000000-0000-0000-0000-000000000002")
   */
  async dissociateRecord(entitySetName, parentId, propertyName, childId) {
    const resource = `${getName(entitySetName)}(${parentId})/${getName(propertyName)}${childId ? `(${childId})` : ""}/$ref`;
    await this.fetch(resource, { method: "DELETE" });
    return childId ?? parentId;
  }
  /**
   * Retrieves associated records via a collection navigation property.
   *
   * @example
   * const contacts = await client.getAssociatedRecords("accounts",
   *   "00000000-0000-0000-0000-000000000001",
   *   "contact_customer_accounts",
   *   "$select=fullname,email")
   */
  async getAssociatedRecords(entitySetName, id, navigationPropertyName, query = "") {
    const resource = `${getName(entitySetName)}(${id})/${getName(navigationPropertyName)}?${query}`;
    return this.fetch(resource).then((r) => r.value);
  }
  /**
   * Retrieves a single associated record via a single-valued navigation property.
   *
   * @example
   * const contact = await client.getAssociatedRecord("accounts",
   *   "00000000-0000-0000-0000-000000000001",
   *   "primarycontactid",
   *   "$select=fullname,email")
   */
  async getAssociatedRecord(entitySetName, id, navigationPropertyName, query = "") {
    const resource = `${getName(entitySetName)}(${id})/${getName(navigationPropertyName)}?${query}`;
    return this.fetch(resource);
  }
  /**
   * Synchronizes a list of associated records: adds new ones and removes ones
   * no longer in the list.
   *
   * @example
   * await client.associateRecordToList("accounts",
   *   "00000000-0000-0000-0000-000000000001",
   *   "contact_customer_accounts",
   *   "contacts",
   *   "contactid",
   *   ["id1", "id2", "id3"])
   */
  async associateRecordToList(entitySetName, parentId, propertyName, childEntitySetName, childPrimaryKeyName, childIds) {
    const currentAssociated = await this.getAssociatedRecords(
      entitySetName,
      parentId,
      propertyName,
      `$select=${getName(childPrimaryKeyName)}`
    );
    const currentIds = currentAssociated.map((r) => r[getName(childPrimaryKeyName)]);
    const promises = [];
    for (const id of childIds) {
      if (!currentIds.includes(id)) {
        promises.push(this.associateRecord(entitySetName, parentId, propertyName, childEntitySetName, id));
      }
    }
    for (const id of currentIds) {
      if (!childIds.includes(id)) {
        promises.push(this.dissociateRecord(entitySetName, parentId, propertyName, id));
      }
    }
    await Promise.all(promises);
    return childIds;
  }
  //
  // --- ACTIONS (POST - have side effects) ---
  //
  /**
   * Executes an unbound Dataverse action (POST).
   *
   * @example
   * const result = await client.executeAction("WinQuote", {
   *   QuoteClose: { ... },
   *   Status: 4,
   * })
   */
  async executeAction(actionName, params) {
    return this.fetch(actionName, {
      method: "POST",
      body: params ? JSON.stringify(params) : void 0
    });
  }
  /**
   * Executes a bound Dataverse action on a specific record or entity set (POST).
   *
   * @example
   * // Bound to a record
   * await client.executeBoundAction("accounts",
   *   "WinQuote", { Status: 4 },
   *   "00000000-0000-0000-0000-000000000001")
   *
   * @example
   * // Bound to an entity set (no id)
   * await client.executeBoundAction("accounts", "BulkDelete", { Query: ... })
   */
  async executeBoundAction(entitySetName, actionName, params, id) {
    const path = id ? `${getName(entitySetName)}(${id})/Microsoft.Dynamics.CRM.${actionName}` : `${getName(entitySetName)}/Microsoft.Dynamics.CRM.${actionName}`;
    return this.fetch(path, {
      method: "POST",
      body: params ? JSON.stringify(params) : void 0
    });
  }
  //
  // --- FUNCTIONS (GET - no side effects) ---
  //
  /**
   * Executes an unbound Dataverse function (GET).
   *
   * @example
   * const result = await client.executeFunction("WhoAmI")
   *
   * @example
   * const result = await client.executeFunction("CalculateTotalTime",
   *   { Start: "2025-01-01", End: "2025-12-31" })
   */
  async executeFunction(functionName, params) {
    const paramString = params ? `(${Object.entries(params).map(([k, v]) => `${k}=${wrapString(v)}`).join(",")})` : "()";
    return this.fetch(`${functionName}${paramString}`);
  }
  /**
   * Executes a bound Dataverse function on a specific record (GET).
   *
   * @example
   * const result = await client.executeBoundFunction("accounts",
   *   "00000000-0000-0000-0000-000000000001",
   *   "CalculateDepreciation",
   *   { Year: 2025 })
   */
  async executeBoundFunction(entitySetName, id, functionName, params) {
    const paramString = params ? `(${Object.entries(params).map(([k, v]) => `${k}=${wrapString(v)}`).join(",")})` : "()";
    return this.fetch(
      `${getName(entitySetName)}(${id})/Microsoft.Dynamics.CRM.${functionName}${paramString}`
    );
  }
  //
  // --- BULK OPERATIONS ---
  //
  /**
   * Creates multiple records in a single API call using CreateMultiple.
   *
   * @example
   * await client.createMultiple("accounts", [
   *   { name: "Account 1" },
   *   { name: "Account 2" },
   * ])
   */
  async createMultiple(entitySetName, records) {
    return this.fetch(
      `${getName(entitySetName)}/Microsoft.Dynamics.CRM.CreateMultiple`,
      { method: "POST", body: JSON.stringify({ Targets: records }) }
    );
  }
  /**
   * Updates multiple records in a single API call using UpdateMultiple.
   *
   * @example
   * await client.updateMultiple("accounts", [
   *   { accountid: "id1", name: "Updated 1" },
   *   { accountid: "id2", name: "Updated 2" },
   * ])
   */
  async updateMultiple(entitySetName, records) {
    return this.fetch(
      `${getName(entitySetName)}/Microsoft.Dynamics.CRM.UpdateMultiple`,
      { method: "POST", body: JSON.stringify({ Targets: records }) }
    );
  }
  /**
   * Deletes multiple records in a single API call by their IDs.
   *
   * @example
   * await client.deleteMultiple("accounts", [
   *   "00000000-0000-0000-0000-000000000001",
   *   "00000000-0000-0000-0000-000000000002",
   * ])
   */
  async deleteMultiple(entitySetName, ids) {
    const targets = ids.map((id) => ({
      "@odata.id": `${this.options.url}/api/data/v9.2/${getName(entitySetName)}(${id})`
    }));
    return this.fetch(
      `${getName(entitySetName)}/Microsoft.Dynamics.CRM.DeleteMultiple`,
      { method: "POST", body: JSON.stringify({ Targets: targets }) }
    );
  }
  _batchTxs = null;
  /**
   * Groups multiple requests into a batch for improved performance.
   * All fetch() calls inside the callback are collected and sent as a single
   * HTTP request.
   *
   * @example
   * await client.batch(async () => {
   *   await client.getRecord("accounts", "id1", "$select=name");
   *   await client.getRecord("accounts", "id2", "$select=name");
   * })
   */
  async batch(fn) {
    if (this._batchTxs) throw new Error("Cannot nest batches");
    let tx = [];
    this._batchTxs = tx;
    try {
      await fn();
    } finally {
      tx = this._batchTxs;
      this._batchTxs = null;
    }
    if (!tx) return;
    const batchId = crypto.randomUUID();
    const body = [tx.map((v, i) => [`--batch_${batchId}`, v]), `--batch_${batchId}--`].flat(10).join("\n");
    const result = await this.fetch("$batch", {
      method: "POST",
      headers: {
        "Content-Type": `multipart/mixed; boundary="batch_${batchId}"`
      },
      body
    });
    return result;
  }
  _processBatch(resource, options) {
    if (!this._batchTxs) return false;
    this._batchTxs.push([
      `${options.method} /api/data/v9.2/${resource} HTTP/1.1`,
      `Content-Type: ${options.headers?.["Content-Type"]}`,
      "",
      options.body?.toString() ?? ""
    ]);
    return true;
  }
  _changeSetTxs = null;
  /**
   * Groups multiple write operations into a change set within a batch.
   * All changes in a change set are committed atomically.
   * If not already inside a batch, automatically wraps one.
   *
   * @example
   * await client.changeset(async () => {
   *   await client.postRecordGetId("accounts", { name: "New" });
   *   await client.patchRecord("accounts", "id", { name: "Updated" });
   * })
   */
  async changeset(fn) {
    if (this._changeSetTxs) throw new Error("Cannot nest changesets");
    if (!this._batchTxs) return this.batch(() => this.changeset(fn));
    this._changeSetTxs = [];
    try {
      await fn();
    } finally {
      const id = crypto.randomUUID();
      this._batchTxs.push([
        `Content-Type: multipart/mixed; boundary="changeset_${id}"`,
        "",
        this._changeSetTxs.map((v, i) => [
          `--changeset_${id}`,
          `Content-Type: application/http`,
          `Content-Transfer-Encoding: binary`,
          `Content-ID: ${i + 1}`,
          "",
          v
        ]),
        `--changeset_${id}--`
      ]);
      this._changeSetTxs = null;
    }
  }
  _processChangeset(resource, options) {
    if (!this._batchTxs) return false;
    if (!this._changeSetTxs) return false;
    this._changeSetTxs.push([
      `${options.method} /api/data/v9.2/${resource} HTTP/1.1`,
      `Content-Type: application/json; type=entry`,
      "",
      options.body?.toString() ?? ""
    ]);
    return true;
  }
}

async function RetrieveAadUserRoles(client, aadId) {
  return client.fetch(
    `RetrieveAadUserRoles(DirectoryObjectId=${aadId})?$select=name`
  ).then((d) => new Set(d.value.map((r) => r.name)));
}
async function RetrieveTotalRecordCount(client, logicalName) {
  return client.fetch(
    `RetrieveTotalRecordCount(EntityNames=['${logicalName}'])`
  ).then((d) => d.Values[0]);
}
async function WhoAmI(client) {
  return client.fetch(`WhoAmI()`).then((r) => ({
    BusinessUnitId: r.BusinessUnitId,
    UserId: r.UserId,
    OrganizationId: r.OrganizationId
  }));
}
async function RetrieveChoices(client, name) {
  return client.fetch(`GlobalOptionSetDefinitions(Name=${wrapString(name)})`).then(mapChoices);
}
function mapChoices(data) {
  return [...data.Options].map((option) => ({
    value: Number(option.Value),
    color: String(option.Color),
    label: String(option.Label.UserLocalizedLabel.Label),
    description: String(option.Description.UserLocalizedLabel.Label)
  }));
}

function required() {
  return (v) => {
    if (v === null || v === void 0) return "Required";
  };
}
function pattern(regex, message) {
  return (v) => {
    if (v && !regex.test(v)) {
      return message || "Invalid format";
    }
  };
}
function numeric() {
  return (v) => {
    if (v !== void 0 && v !== null) {
      const num = Number(v);
      if (isNaN(num)) {
        return "Must be a number";
      }
    }
  };
}
function minValue(min) {
  return (v) => {
    if (typeof v === "number" && v < min) {
      return `Must be at least ${min}`;
    }
  };
}
function minLength(min) {
  return (v) => {
    if (v.length < min) return `Length less than ${min}`;
  };
}
function maxValue(max) {
  return (v) => {
    if (typeof v === "number" && v > max) {
      return `Must be no more than ${max}`;
    }
  };
}
function maxLength(max) {
  return (v) => {
    if (v.length > max) return `Length more than ${max}`;
  };
}
function isTypeOrNull(type) {
  return (v) => {
    if (v === null) return;
    if (typeof v !== type) {
      return "Not of type " + type;
    }
  };
}
function isType(type) {
  return (v) => {
    if (typeof v !== type) {
      return "Not of type " + type;
    }
  };
}
function integer() {
  return (v) => {
    if (v !== void 0 && v !== null) {
      const num = Number(v);
      if (isNaN(num) || !Number.isInteger(num)) {
        return "Must be an integer";
      }
    }
  };
}
function email() {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return (v) => {
    if (v && !emailRegex.test(v)) {
      return "Invalid email format";
    }
  };
}

class Schema {
  name;
  toDataverseName;
  fromDataverseName;
  kind = "schema";
  type = "schema";
  #default;
  /**
   * @param name The Dataverse logical name of the column/attribute.
   * @param defaultValue The default value used when no value is provided.
   */
  constructor(name, defaultValue) {
    this.name = name;
    this.fromDataverseName = name;
    this.toDataverseName = name;
    this.#default = defaultValue;
  }
  /**
   * Overrides the default value for this property.
   *
   * @example
   * const field = new StringField("firstname").setDefault("John");
   * field.getDefault(); // "John"
   */
  setDefault(value) {
    this.#default = value;
    return this;
  }
  /**
   * Returns the default value for this property.
   */
  getDefault() {
    return this.#default;
  }
  #readOnly = false;
  /**
   * Marks this property as read-only. Read-only properties are excluded
   * when transforming data for Dataverse (e.g. they won't be sent in create/update).
   *
   * @param value Whether the property should be read-only. Defaults to `true`.
   *
   * @example
   * const field = new StringField("createdby").setReadOnly(true);
   * field.getReadOnly(); // true
   */
  setReadOnly(value = true) {
    this.#readOnly = value;
    return this;
  }
  /**
   * Returns whether this property is read-only.
   */
  getReadOnly() {
    return this.#readOnly;
  }
  #validators = [];
  /**
   * Adds a validation function to this property. Validators run during
   * {@link validate} and {@link parse}. A validator returns `undefined` if valid,
   * or an error message string if invalid.
   *
   * @example
   * const field = new StringField("zip").check((v) =>
   *   /^\d{5}(-\d{4})?$/.test(v) ? undefined : "Invalid ZIP code"
   * );
   * field.parse("12345"); // ok
   * field.parse("abc");   // throws
   */
  check(v) {
    this.#validators.push(v);
    return this;
  }
  /**
   * Adds a "required" validator that rejects `null` or `undefined` values.
   *
   * @example
   * const field = new StringField("email").required();
   * field.validate(null);  // { issues: [{ message: "Required" }] }
   * field.validate("a@b"); // { value: "a@b" }
   */
  required() {
    return this.check(required());
  }
  /**
   * Transforms a raw value from Dataverse into the property's TypeScript type.
   * Override this in subclasses for custom deserialization (e.g. string → Date).
   *
   * @param value The raw value from the Dataverse API.
   * @returns The typed value.
   *
   * @example
   * // A custom date-only field
   * class DateOnlyField extends Schema<Date> {
   *   transformValueFromDataverse(value: any): Date {
   *     return new Date(value + "T00:00:00Z");
   *   }
   * }
   */
  transformValueFromDataverse(value) {
    return value;
  }
  /**
   * Transforms the property's value into a format suitable for Dataverse.
   * Override this in subclasses for custom serialization (e.g. Date → string).
   *
   * @param value The property value to send to Dataverse.
   * @returns The serialized value.
   *
   * @example
   * class DateOnlyField extends Schema<Date> {
   *   transformValueToDataverse(value: Date): string {
   *     return value.toISOString().slice(0, 10);
   *   }
   * }
   */
  transformValueToDataverse(value) {
    return value;
  }
  getIssues(value, path = []) {
    const issues = [];
    this.#validators.forEach((fn) => {
      try {
        let message = fn(value);
        if (message) {
          issues.push({
            message,
            path
          });
        }
      } catch (e) {
        issues.push({
          message: e?.message ?? String(e),
          path
        });
      }
    });
    return issues;
  }
  /**
   * Validates a value against this property's validators. Returns either
   * `{ value }` on success or `{ issues }` on failure.
   *
   * @example
   * const field = new StringField("email").required();
   * field.validate("test@example.com"); // { value: "test@example.com" }
   * field.validate(null);               // { issues: [{ message: "Required", path: [] }] }
   */
  validate(value, path = []) {
    const issues = this.getIssues(value, path);
    return issues.length > 0 ? { issues } : {
      value
    };
  }
  /**
   * Validates a value and returns it if valid, or throws if invalid.
   * This is a convenience wrapper around {@link validate}.
   *
   * @throws {Error} If validation fails, the error message contains the JSON-serialized issues.
   *
   * @example
   * const field = new StringField("age").check((v) =>
   *   Number(v) >= 0 ? undefined : "Must be non-negative"
   * );
   * field.parse("25");  // "25"
   * field.parse("-1");  // throws Error("[{\"message\":\"Must be non-negative\",\"path\":[]}]")
   */
  parse(value) {
    const result = this.validate(value);
    if (result.issues) {
      throw new Error(JSON.stringify(result.issues), {});
    } else {
      return result.value;
    }
  }
  /**
   * Provides access to the standard schema properties for this property.
   * This is a computed property.
   *
   * @returns An object containing the standard schema properties, including version, vendor, and a validation function.
   */
  get ["~standard"]() {
    return {
      version: 1,
      vendor: "dataverse-schema",
      validate: (v) => this.validate(v)
    };
  }
}

class Table extends Schema {
  client;
  fields;
  kind = "table";
  type = "table";
  /**
   * @param client An instance of the DataverseClient for all API operations.
   * @param entitySetName The logical collection name of the Dataverse table (e.g. `"accounts"`).
   * @param props An object mapping property names to field definitions.
   */
  constructor(client, entitySetName, props) {
    super(entitySetName, null);
    this.client = client;
    this.name = entitySetName;
    this.fields = props;
  }
  getIssues(value, path = []) {
    const issues = super.getIssues(value, path);
    if (typeof value !== "object" || value === null) value = {};
    for (const [key, property] of Object.entries(this.fields)) {
      if (!property.getReadOnly())
        issues.push(...property.getIssues(value[key], [...path, key]));
    }
    return issues;
  }
  getDefault(value) {
    const result = {};
    for (const [key, property] of Object.entries(this.fields)) {
      if (value === void 0 || !(key in value)) {
        result[key] = property.getDefault();
      } else {
        result[key] = value[key];
      }
    }
    return result;
  }
  /**
   * Retrieves a single record by its primary key (GUID) or alternate key.
   * Returns `null` when the record is not found.
   *
   * @param id The primary key GUID, alternate key, or string identifier.
   *
   * @example
   * const account = await Account.getRecord("acme-1234-abcd");
   * if (account) console.log(account.name);
   */
  async getRecord(id) {
    return this.client.getRecord(this.name, id, buildQuery(this)).then((v) => this.transformValueFromDataverse(v));
  }
  getAlternateKeys(value) {
    return Object.entries(value).map((kv) => `${this.fields[kv[0]].name}=${kv[1]}`).join(",");
  }
  /**
   * Retrieves multiple records from the table, with optional filtering, sorting, and paging.
   *
   * @param queryOptions Optional query parameters (filter, orderby, top).
   *
   * @example
   * const activeAccounts = await Account.getRecords({
   *   filter: "statecode eq 0",
   *   orderby: "name asc",
   *   top: 10,
   * });
   */
  async getRecords(queryOptions) {
    return this.client.getRecords(this.name, buildQuery(this, queryOptions)).then((values) => values.map((v) => this.transformValueFromDataverse(v)));
  }
  /**
   * Retrieves the value of a single property for a record by ID.
   * Works for value properties, lookup IDs, lookups (returns expanded record), and collections.
   *
   * @example
   * const age = await Person.getPropertyValue("age", "some-guid");
   * const address = await Person.getPropertyValue("primaryAddress", "some-guid");
   */
  async getPropertyValue(key, id, queryOptions) {
    const prop = this.fields[key];
    if (prop.kind === "value" || prop.type === "lookupId") {
      return this.client.getPropertyValue(this.name, id, prop.name).then((v) => prop.transformValueFromDataverse(v));
    }
    if (prop.type === "collection" || prop.type === "collectionIds") {
      return this.client.getAssociatedRecords(
        this.name,
        id,
        prop.name,
        buildQuery(prop.table, queryOptions)
        // Note: buildQuery needs to handle related table schema
      ).then(
        (v) => prop.transformValueFromDataverse(v)
      );
    }
    if (prop.type === "lookup") {
      return this.client.getAssociatedRecord(
        this.name,
        id,
        prop.name,
        buildQuery(prop.table, queryOptions)
      ).then(
        (v) => prop.transformValueFromDataverse(v)
      );
    }
    throw new Error("Invalid Property kind for getPropertyValue");
  }
  /**
   * Updates the value of a single property for a record by ID.
   * For navigation properties, this associates/dissociates related records.
   *
   * @example
   * await Person.updatePropertyValue("age", "some-guid", 35);
   */
  async updatePropertyValue(key, id, value) {
    const prop = this.fields[key];
    if (prop.kind === "navigation") {
      await this.updateNavigationProperty(prop, id, value);
    } else {
      await this.client.updatePropertyValue(
        this.name,
        id,
        this.fields[key].name,
        prop.transformValueToDataverse(value)
      );
    }
    return id;
  }
  async updateNavigationProperty(property, id, value) {
    if (property.type === "collection" || property.type === "collectionIds") {
      if (Array.isArray(value)) {
        const ids = property.type === "collection" ? await Promise.all(
          value.map((v) => property.table.upsertRecord(void 0, v))
        ) : value;
        return this.client.associateRecordToList(
          this.name,
          id,
          property.name,
          property.table.name,
          property.table.getPrimaryKey().property.name,
          ids
        );
      }
    }
    if (property.type === "lookup" || property.type == "lookupId") {
      const name = property.type === "lookup" ? property.name : property.navigationName;
      if (value === null) {
        return this.client.dissociateRecord(this.name, id, name);
      } else {
        const childId = property.type === "lookup" ? await property.table.upsertRecord(void 0, value) : value;
        return this.client.associateRecord(
          this.name,
          id,
          name,
          property.table.name,
          childId
        );
      }
    }
  }
  /**
   * Links an existing child record to a parent record through a navigation property.
   *
   * @example
   * await Person.associateRecord("primaryAddress", "person-guid", "address-guid");
   */
  async associateRecord(key, id, childId) {
    const prop = this.fields[key];
    if (prop.kind === "navigation") {
      return this.client.associateRecord(
        this.name,
        id,
        prop.name,
        prop.table.name,
        childId
      );
    } else {
      throw new Error("Can only associate to navigation properties");
    }
  }
  async dissociateRecord(key, id, childId) {
    const prop = this.fields[key];
    if (prop.kind === "navigation") {
      return this.client.dissociateRecord(this.name, id, prop.name, childId);
    } else {
      throw new Error("Can only dissociate navigation properties");
    }
  }
  /**
   * Creates a new record in Dataverse and returns its generated GUID.
   *
   * @param value The record data (partial — primary key is auto-generated).
   *
   * @example
   * const newId = await Person.insertRecord({ name: "John", age: 30 });
   */
  async insertRecord(value) {
    const pkName = this.getPrimaryKey().property.name;
    const record = await this.client.postRecord(
      this.name,
      this.transformValueToDataverse(value),
      query({ select: pkName })
    );
    return record?.[pkName];
  }
  /**
   * Updates an existing record by ID. Supports optimistic concurrency via etag.
   *
   * @param id The record's primary key.
   * @param value The fields to update (partial record data).
   * @param etag Optional etag for conditional updates (If-Match header).
   *
   * @example
   * await Person.updateRecord("some-guid", { name: "Jane" });
   * // With etag:
   * await Person.updateRecord("some-guid", { name: "Jane" }, 'W/"123456"');
   */
  async updateRecord(id, value, etag) {
    if (!id) throw new Error("No ID provided");
    await this.client.patchRecord(
      this.name,
      id,
      this.transformValueToDataverse(value),
      "",
      etag
    );
    return id;
  }
  /**
   * Creates or updates a record. If `id` is provided the record is updated;
   * otherwise a new record is created. Navigation properties (collections, lookups)
   * are also synced through nested upserts.
   *
   * @param id The GUID of an existing record, or `undefined` to create new.
   * @param value The record data (partial for updates).
   * @param etag Optional etag for conditional upsert.
   *
   * @example
   * // Create
   * const newId = await Person.upsertRecord(undefined, { name: "John" });
   * // Update
   * await Person.upsertRecord(existingId, { name: "Jane" });
   */
  async upsertRecord(id, value, etag) {
    const promises = [];
    const pkName = this.getPrimaryKey().property.name;
    if (id) {
      promises.push(
        this.client.patchRecord(
          this.name,
          id,
          this.transformValueToDataverse(value),
          query({ select: pkName }),
          etag
        )
      );
    } else {
      const record = await this.client.postRecord(
        this.name,
        this.transformValueToDataverse(value),
        query({ select: pkName })
      );
      id = record[pkName];
    }
    for (const [key, property] of Object.entries(this.fields)) {
      if (property.getReadOnly() || !(key in value)) continue;
      if (property.kind === "navigation" && property.type !== "lookupId") {
        promises.push(
          this.updateNavigationProperty(
            property,
            id,
            value[key]
          )
        );
      }
    }
    await Promise.all(promises);
    return id;
  }
  /**
   * Deletes a record by its primary key. Supports optimistic concurrency via etag.
   *
   * @param id The primary key of the record to delete.
   * @param etag Optional etag for conditional deletion.
   *
   * @example
   * await Person.deleteRecord("some-guid");
   */
  async deleteRecord(id, etag) {
    return this.client.deleteRecord(this.name, id, etag);
  }
  /**
   * Activates a record by setting its `statecode` to 0.
   *
   * @example
   * await Person.activateRecord("some-guid");
   */
  async activateRecord(id) {
    return this.client.activateRecord(this.name, id);
  }
  /**
   * Deactivates a record by setting its `statecode` to 1.
   *
   * @example
   * await Person.deactivateRecord("some-guid");
   */
  async deactivateRecord(id) {
    return this.client.deactivateRecord(this.name, id);
  }
  /**
   * Deletes (clears) the value of a value property for a record. Cannot be used
   * on navigation properties.
   *
   * @example
   * await Person.deletePropertyValue("name", "some-guid");
   */
  async deletePropertyValue(key, id) {
    const prop = this.fields[key];
    if (prop.kind === "value") {
      return this.client.deletePropertyValue(this.name, id, prop.name);
    }
    throw new Error("Cannot delete navigation property values");
  }
  //
  // --- ACTIONS & FUNCTIONS ---
  //
  /**
   * Executes a bound Dataverse action on this entity set or a specific record.
   * POST /{entitySet}({id})/Microsoft.Dynamics.CRM.{ActionName}
   *
   * @param actionName The Dataverse action name (without the CRM namespace prefix, e.g. `"GenerateInvoice"`).
   * @param params Optional parameters to pass in the request body.
   * @param id Optional record GUID — if provided, the action is bound to a specific record.
   *
   * @example
   * // Bound to entity set
   * await Account.executeAction("BulkDetectDuplicates", { ... });
   * // Bound to a record
   * await Account.executeAction("CalculatePrice", { discount: 10 }, "record-guid");
   */
  async executeAction(actionName, params, id) {
    if (id) {
      return this.client.executeBoundAction(this.name, actionName, params, id);
    }
    return this.client.executeBoundAction(this.name, actionName, params);
  }
  /**
   * Executes a bound Dataverse function on a record.
   * GET /{entitySet}({id})/Microsoft.Dynamics.CRM.{FunctionName}(...)
   *
   * @param functionName The Dataverse function name (e.g. `"CalculateActualValueOfOpportunity"`).
   * @param id The record GUID to bind the function to.
   * @param params Optional function parameters (appended as query parameters).
   *
   * @example
   * const result = await Opportunity.executeFunction(
   *   "CalculateActualValueOfOpportunity",
   *   "opportunity-guid",
   * );
   */
  async executeFunction(functionName, id, params) {
    return this.client.executeBoundFunction(this.name, id, functionName, params);
  }
  //
  // --- BULK OPERATIONS ---
  //
  /**
   * Creates multiple records in a single API call via `CreateMultiple`.
   *
   * @param records Array of partial records to create.
   *
   * @example
   * await Account.createMultiple([
   *   { name: "Acme" },
   *   { name: "Beta" },
   * ]);
   */
  async createMultiple(records) {
    return this.client.createMultiple(
      this.name,
      records.map((r) => this.transformValueToDataverse(r))
    );
  }
  /**
   * Updates multiple records in a single API call via `UpdateMultiple`.
   *
   * @param records Array of partial records to update (must include primary key).
   *
   * @example
   * await Account.updateMultiple([
   *   { id: "guid-1", name: "Acme Updated" },
   *   { id: "guid-2", name: "Beta Updated" },
   * ]);
   */
  async updateMultiple(records) {
    return this.client.updateMultiple(
      this.name,
      records.map((r) => this.transformValueToDataverse(r))
    );
  }
  /**
   * Deletes multiple records in a single API call via `DeleteMultiple`.
   *
   * @param ids Array of record GUIDs to delete.
   *
   * @example
   * await Account.deleteMultiple(["guid-1", "guid-2"]);
   */
  async deleteMultiple(ids) {
    return this.client.deleteMultiple(this.name, ids);
  }
  /**
   * Returns the primary key field definition for this table.
   *
   * @example
   * const pk = Account.getPrimaryKey();
   * console.log(pk.key);      // "id"
   * console.log(pk.property.name); // "accountid"
   */
  getPrimaryKey() {
    const result = Object.entries(this.fields).find(
      (f) => f[1].type === "primaryKey"
    );
    if (!result) throw new Error("No Primary Key found in schema");
    return {
      key: result[0],
      property: result[1]
    };
  }
  /**
   * Extracts the primary key GUID from a record object, or `undefined` if not present.
   *
   * @example
   * const account = await Account.getRecord("some-guid");
   * const pk = Account.getPrimaryId(account); // GUID | undefined
   */
  getPrimaryId(value) {
    const { key } = this.getPrimaryKey();
    return value[key];
  }
  transformValueFromDataverse(value) {
    if (value === null) return null;
    const result = {};
    for (const [key, property] of Object.entries(this.fields)) {
      result[key] = property.transformValueFromDataverse(value[property.fromDataverseName]);
    }
    result[Etag] = value[Etag];
    return result;
  }
  transformValueToDataverse(value) {
    if (value === null) return null;
    const result = {};
    for (const [key, property] of Object.entries(this.fields)) {
      if (property.getReadOnly() || !(key in value)) continue;
      if (property.kind === "value" || property.type === "lookupId") {
        const v = property.transformValueToDataverse(
          value[key]
        );
        result[property.toDataverseName] = v;
      }
    }
    return result;
  }
  /**
   * Creates a new `Table` with only the specified properties. Useful for
   * narrowing the type when querying a subset of columns.
   *
   * @example
   * const NameOnly = Account.pickProperties("name", "id");
   * const records = await NameOnly.getRecords(); // { name: string; id: GUID }[]
   */
  pickProperties(...keys) {
    const properties = Object.fromEntries(
      Object.entries(this.fields).filter((v) => keys.includes(v[0]))
    );
    return new Table(this.client, this.name, properties);
  }
  /**
   * Creates a new `Table` with the specified properties excluded.
   *
   * @example
   * const WithoutSensitive = Person.omitProperties("ssn");
   */
  omitProperties(...keys) {
    const properties = Object.fromEntries(
      Object.entries(this.fields).filter((v) => !keys.includes(v[0]))
    );
    return new Table(this.client, this.name, properties);
  }
  /**
   * Creates a new `Table` with additional properties appended.
   *
   * @example
   * const Extended = Account.appendProperties({
   *   customField: string("new_stringcolumn"),
   * });
   * // Extended has all original fields plus `customField`
   */
  appendProperties(properties) {
    return new Table(this.client, this.name, {
      ...this.fields,
      ...properties
    });
  }
  /** Use for type inference: `Infer<typeof Account>` resolves to the record type. */
  T;
}
function table(client, name, properties) {
  return new Table(client, name, properties);
}
function buildQuery(table2, q) {
  return query({
    top: q?.top,
    filter: q?.filter,
    orderby: q?.orderby ? Object.entries(q?.orderby ?? {}).map(([key, value]) => `${table2.fields[key].name} ${value}`).join(",") : void 0,
    select: buildSelect(table2),
    expand: buildExpand(table2)
  });
}
function buildSelect(table2) {
  return Object.values(table2.fields).filter((v) => v.kind === "value" || v.type === "lookupId" || v.type === "file").map((v) => v.fromDataverseName).join(",");
}
function buildExpand(table2, depth = 0) {
  if (depth > 3) return "";
  return Object.values(table2.fields).filter(
    (v) => v.kind === "navigation" && v.type !== "lookupId" && v.type !== "collectionIds"
  ).map((v) => {
    const navProp = v;
    const innerSelect = buildSelect(navProp.table);
    const innerExpand = buildExpand(navProp.table, depth + 1);
    let expandQuery = `$select=${innerSelect}`;
    if (innerExpand) {
      expandQuery += `;$expand=${innerExpand}`;
    }
    return `${navProp.name}(${expandQuery})`;
  }).join(",");
}

class BooleanField extends Schema {
  kind = "value";
  type = "boolean";
  constructor(name) {
    super(name, false);
    this.check(isType("boolean"));
  }
}
class NumberField extends Schema {
  kind = "value";
  type = "number";
  constructor(name) {
    super(name, 0);
    this.check(isType("number"));
  }
  transformValueFromDataverse(value) {
    return value ?? 0;
  }
}
class NullableNumberField extends Schema {
  kind = "value";
  type = "number";
  constructor(name) {
    super(name, null);
    this.check(isTypeOrNull("number"));
  }
}
class StringField extends Schema {
  kind = "value";
  type = "string";
  constructor(name) {
    super(name, "");
    this.check(isType("string"));
  }
  transformValueFromDataverse(value) {
    return value ?? "";
  }
}
class NullableStringField extends Schema {
  kind = "value";
  type = "string";
  constructor(name) {
    super(name, null);
    this.check(isTypeOrNull("string"));
  }
}
class PrimaryKeyField extends Schema {
  kind = "value";
  type = "primaryKey";
  constructor(name) {
    super(name, "");
    this.check(isType("string"));
  }
  getDefault() {
    return crypto.randomUUID();
  }
}
class ListField extends Schema {
  kind = "value";
  type = "list";
  list;
  constructor(name, list2) {
    super(name, null);
    this.list = list2;
    this.check((v) => {
      if (v !== null && !list2.includes(v)) {
        return `${v} not in [${list2}]`;
      }
    });
  }
}
class DateTimeField extends Schema {
  kind = "value";
  type = "date";
  constructor(name) {
    super(name, /* @__PURE__ */ new Date());
    this.check((v) => v instanceof Date ? void 0 : "value is not Date");
  }
  getDefault() {
    return /* @__PURE__ */ new Date();
  }
  transformValueFromDataverse(value) {
    if (value === null) return /* @__PURE__ */ new Date();
    return new Date(value);
  }
}
class NullableDateTimeField extends Schema {
  kind = "value";
  type = "date";
  constructor(name) {
    super(name, null);
    this.check(
      (v) => v === null || v instanceof Date ? void 0 : "value is not Date or null"
    );
  }
  transformValueFromDataverse(value) {
    if (value === null) return null;
    return new Date(value);
  }
}
class DateField extends Schema {
  kind = "value";
  type = "dateOnly";
  constructor(name) {
    super(name, parseDateOnly((/* @__PURE__ */ new Date()).toISOString()));
    this.check(
      (v) => v instanceof Date ? void 0 : "value is not Date"
    );
  }
  transformValueFromDataverse(value) {
    if (value === null) return parseDateOnly((/* @__PURE__ */ new Date()).toISOString());
    return parseDateOnly(value);
  }
  transformValueToDataverse(value) {
    return toDateOnly(value);
  }
}
class NullableDateField extends Schema {
  kind = "value";
  type = "dateOnly";
  constructor(name) {
    super(name, null);
    this.check(
      (v) => v === null || v instanceof Date ? void 0 : "value is not Date or null"
    );
  }
  transformValueFromDataverse(value) {
    if (value === null) return null;
    return parseDateOnly(value);
  }
  transformValueToDataverse(value) {
    return toDateOnly(value);
  }
}
class FormattedField extends Schema {
  kind = "value";
  type = "formatted";
  constructor(name) {
    super(name, null);
    this.fromDataverseName = `${name}@OData.Community.Display.V1.FormattedValue`;
    this.setReadOnly(true);
  }
}
class ImageField extends Schema {
  kind = "value";
  type = "image";
  constructor(name) {
    super(name, null);
    this.check(isTypeOrNull("string"));
  }
}
class FileField extends Schema {
  type = "file";
  kind = "file";
  constructor(name) {
    super(name, "");
    this.fromDataverseName = `${name}_name`;
    this.setReadOnly(true);
  }
}
function boolean(name) {
  return new BooleanField(name);
}
function number(name) {
  return new NumberField(name);
}
function nullableNumber(name) {
  return new NullableNumberField(name);
}
function string(name) {
  return new StringField(name);
}
function nullableString(name) {
  return new NullableStringField(name);
}
function primaryKey(name) {
  return new PrimaryKeyField(name);
}
function list(name, list2) {
  return new ListField(name, list2);
}
function datetime(name) {
  return new DateTimeField(name);
}
function date(name) {
  return new DateField(name);
}
function nullableDate(name) {
  return new NullableDateField(name);
}
function nullableDateTime(name) {
  return new NullableDateTimeField(name);
}
function formatted(name) {
  return new FormattedField(name);
}
function image(name) {
  return new ImageField(name);
}
function file(name) {
  return new FileField(name);
}
class LookupIdProperty extends Schema {
  kind = "navigation";
  type = "lookupId";
  navigationName;
  #getTable;
  constructor(name, getTable) {
    super(name, null);
    this.navigationName = name;
    this.#getTable = getTable;
    this.fromDataverseName = `_${name.toLowerCase()}_value`;
    this.toDataverseName = `${this.name}@odata.bind`;
  }
  #table;
  get table() {
    if (!this.#table) {
      const table = this.#getTable();
      const { property } = table.getPrimaryKey();
      this.#table = new Table(table.client, table.name, { id: property });
    }
    return this.#table;
  }
  transformValueToDataverse(value) {
    if (value) {
      return `${this.table.name}(${value})`;
    } else {
      return null;
    }
  }
}
class CollectionProperty extends Schema {
  kind = "navigation";
  type = "collection";
  #getTable;
  constructor(name, getTable) {
    super(name, []);
    this.#getTable = getTable;
    this.check(
      (v) => !Array.isArray(v) ? "value is not an array" : void 0
    );
  }
  #table;
  get table() {
    return this.#table ??= this.#getTable();
  }
  transformValueFromDataverse(value) {
    return Array.from(value ?? []).map(
      (v) => this.table.transformValueFromDataverse(v)
    );
  }
  getIssues(value, path = []) {
    const issues = super.getIssues(value, path);
    if (Array.isArray(value)) {
      issues.push(
        ...value.map((v, i) => this.table.getIssues(v, [...path, i])).flat(1)
      );
    }
    return issues;
  }
}
function collection(name, getTable) {
  return new CollectionProperty(name, getTable);
}
class CollectionIdsProperty extends Schema {
  kind = "navigation";
  type = "collectionIds";
  #getTable;
  constructor(name, getTable) {
    super(name, []);
    this.#getTable = getTable;
    this.check(
      (v) => !Array.isArray(v) ? "value is not an array" : void 0
    );
  }
  #table;
  get table() {
    if (!this.#table) {
      const table = this.#getTable();
      const { property } = table.getPrimaryKey();
      this.#table = new Table(table.client, table.name, { id: property });
    }
    return this.#table;
  }
  transformValueFromDataverse(value) {
    return Array.from(value ?? []).map((v) => v[this.table.fields.id.name]);
  }
  getIssues(value, path = []) {
    const issues = super.getIssues(value, path);
    if (Array.isArray(value)) {
      issues.push(
        ...value.map((v, i) => this.table.fields.id.getIssues(v, [...path, i])).flat(1)
      );
    }
    return issues;
  }
}
function collectionIds(name, getTable) {
  return new CollectionIdsProperty(name, getTable);
}
function lookupId(name, getTable) {
  return new LookupIdProperty(name, getTable);
}
class LookupProperty extends Schema {
  kind = "navigation";
  type = "lookup";
  #getTable;
  constructor(name, getTable) {
    super(name, null);
    this.#getTable = getTable;
  }
  #table;
  get table() {
    return this.#table ??= this.#getTable();
  }
  transformValueFromDataverse(value) {
    return value == null ? null : this.table.transformValueFromDataverse(value);
  }
  getIssues(value, path) {
    const issues = super.getIssues(value, path);
    if (value !== null) {
      issues.push(...this.table.getIssues(value, path));
    }
    return issues;
  }
}
function lookup(name, getTable) {
  return new LookupProperty(name, getTable);
}

class ODataQuery {
  _table;
  _fields = [];
  _filters = [];
  _expands = [];
  _orderby = [];
  _top;
  _includeCount = false;
  _apply = "";
  _lambdaAliasIndex = 0;
  _proxy;
  constructor(table) {
    this._table = table;
    this._proxy = this._buildProxy();
  }
  _buildProxy() {
    return this._buildProxyForTable(this._table);
  }
  _buildProxyForTable(table, prefix) {
    const proxy = {};
    const fields = table.fields;
    for (const [key, prop] of Object.entries(fields)) {
      const dataverseName = prop.fromDataverseName ?? prop.name;
      if (prop.kind === "navigation" && (prop.type === "lookup" || prop.type === "collection")) {
        const navProp = prop;
        const currentPrefix = prefix ? `${prefix}/${dataverseName}` : dataverseName;
        let cached;
        Object.defineProperty(proxy, key, {
          get: () => {
            if (!cached) {
              const sub = this._buildProxyForTable(navProp.table, currentPrefix);
              sub.toString = () => dataverseName;
              const lambdaMap = {};
              const navFields = navProp.table.fields;
              for (const [lk, lp] of Object.entries(navFields)) {
                lambdaMap[lk] = lp.fromDataverseName ?? lp.name;
              }
              const buildLambdaProxy = (alias) => {
                const lp = {};
                for (const [k, n] of Object.entries(lambdaMap)) lp[k] = `${alias}/${n}`;
                return lp;
              };
              const resolveAliasAndCallback = (a, b) => {
                if (typeof a === "function") {
                  const alias = String.fromCharCode(97 + this._lambdaAliasIndex++ % 26);
                  return { alias, cb: a };
                }
                return { alias: a, cb: b };
              };
              sub.any = (a, b) => {
                const { alias, cb } = resolveAliasAndCallback(a, b);
                return `${getName(sub)}/any(${alias}: ${cb(buildLambdaProxy(alias))})`;
              };
              sub.all = (a, b) => {
                const { alias, cb } = resolveAliasAndCallback(a, b);
                return `${getName(sub)}/all(${alias}: ${cb(buildLambdaProxy(alias))})`;
              };
              cached = sub;
            }
            return cached;
          },
          enumerable: true,
          configurable: true
        });
      } else {
        proxy[key] = prefix ? `${prefix}/${dataverseName}` : dataverseName;
      }
    }
    return proxy;
  }
  /**
   * Restricts the returned columns to the specified fields.
   * This narrows the result type to only the selected properties.
   *
   * @param keys One or more value-field keys (navigation properties are excluded).
   *
   * @example
   * const q = fetchOdata(Person).select("name", "age");
   * // TResult → { name: string; age: number }
   */
  select(...keys) {
    this._fields = keys.map((k) => this._proxy[k]);
    return this;
  }
  where(filter) {
    const str = typeof filter === "string" ? filter : filter(this._proxy);
    this._filters.push(str);
    return this;
  }
  /**
   * Adds a `$expand` clause for a navigation property. The callback receives a
   * nested {@link ODataQuery} scoped to the related table for further `.select()`,
   * `.where()`, `.expand()`, etc.
   *
   * @param key The navigation property key.
   * @param sub A callback to configure the nested query.
   *
   * @example
   * fetchOdata(Person)
   *   .select("name")
   *   .expand("primaryAddress", sub => sub.select("street", "zip"));
   *
   * @example
   * // Nested expand:
   * fetchOdata(Person)
   *   .expand("primaryAddress", sub =>
   *     sub.expand("location", sub2 => sub2.select("name"))
   *   );
   */
  expand(key, sub) {
    const prop = this._table.fields[key];
    const child = new ODataQuery(prop.table);
    const result = sub(child);
    const q = result ?? child;
    this._expands.push({ name: prop.name, query: q._build() });
    return this;
  }
  orderby(arg) {
    if (typeof arg === "function") {
      const result = arg(this._proxy);
      if (result instanceof OrderSpec) {
        this._orderby = result.fields.map((f) => ({ name: f, dir: result.direction }));
      } else if (Array.isArray(result)) {
        this._orderby = result.flatMap((s) => s.fields.map((f) => ({ name: f, dir: s.direction })));
      } else {
        this._orderby = Object.entries(result).filter(([, v]) => v).map(([k, v]) => ({ name: k, dir: v }));
      }
      return this;
    }
    this._orderby = Object.entries(arg).filter(([, v]) => v).map(([k, v]) => ({ name: this._proxy[k], dir: v }));
    return this;
  }
  /**
   * Limits the number of returned records (`$top`).
   *
   * @example
   * fetchOdata(Person).top(10);
   */
  top(n) {
    this._top = n;
    return this;
  }
  /**
   * Includes the total record count in the response (`$count=true`).
   *
   * @example
   * const q = fetchOdata(Person).includeCount();
   * // query string: "$count=true"
   */
  includeCount() {
    this._includeCount = true;
    return this;
  }
  /**
   * Adds a `$apply` expression for server-side aggregation.
   *
   * @param expression A raw OData `$apply` expression.
   *
   * @example
   * fetchOdata(Person).apply("groupby((person_age),aggregate(person_age with sum as total))");
   */
  apply(expression) {
    this._apply = expression;
    return this;
  }
  /**
   * Adds a `$expand` with `/$ref` to retrieve only the related record IDs
   * instead of full expanded records. The navigation property is removed from
   * the result type.
   *
   * @param key The navigation property key.
   *
   * @example
   * const q = fetchOdata(Person).expandRef("primaryAddress");
   * // query: "$expand=person_Address/$ref"
   * // TResult no longer includes primaryAddress
   */
  expandRef(key) {
    const prop = this._table.fields[key];
    this._expands.push({ name: prop.name, query: "", isRef: true });
    return this;
  }
  _build() {
    const parts = [];
    if (this._fields.length) parts.push(`$select=${this._fields.join(",")}`);
    if (this._filters.length === 1) {
      parts.push(`$filter=${this._filters[0]}`);
    } else if (this._filters.length > 1) {
      parts.push(`$filter=${this._filters.join(" and ")}`);
    }
    if (this._orderby.length) {
      parts.push(`$orderby=${this._orderby.map((o) => `${o.name} ${o.dir}`).join(",")}`);
    }
    if (this._expands.length) {
      parts.push(`$expand=${this._expands.map((e) => {
        if (e.isRef) return `${e.name}/$ref`;
        return e.query ? `${e.name}(${e.query})` : e.name;
      }).join(",")}`);
    }
    if (this._top !== void 0) parts.push(`$top=${this._top}`);
    if (this._includeCount) parts.push(`$count=true`);
    if (this._apply) parts.push(`$apply=${this._apply}`);
    return parts.join("&");
  }
  toString() {
    return this._build();
  }
  async execute() {
    const qs = this.toString();
    if (!qs) return this._table.getRecords();
    const raw = await this._table.client.getRecords(this._table.name, qs);
    return raw.map((v) => this._table.transformValueFromDataverse(v));
  }
}
function fetchOdata(table) {
  return new ODataQuery(table);
}

class EntityQueryBuilder {
  _aliasCounter = 0;
  _table;
  _attributes = [];
  _links = [];
  _isDistinct = false;
  _filters = [];
  _proxy;
  _top;
  _page;
  _pageSize;
  _isAggregate = false;
  _returnTotalRecordCount = false;
  _useRawOrderBy = false;
  _lateMaterialize = false;
  _aggregateLimit;
  _orders = [];
  _pagingCookie;
  _datasource;
  _options;
  /** @param table The Table definition to build the query against. */
  constructor(table) {
    this._table = table;
    this._proxy = this._buildProxy();
  }
  _buildProxy() {
    const proxy = {};
    for (const [key, prop] of Object.entries(this._table.fields)) {
      proxy[key] = prop.fromDataverseName ?? prop.name;
    }
    return proxy;
  }
  /**
   * Selects specific fields to include in the FetchXML query.
   * The result type is narrowed to only include selected fields.
   *
   * @example
   * fetchXml(contactTable)
   *   .select(f => ({ name: f.name, email: f.email }))
   */
  select(selector) {
    const fieldsMock = {};
    for (const key of Object.keys(this._table.fields)) {
      fieldsMock[key] = key;
    }
    const selectedMap = selector(fieldsMock);
    for (const [alias, propKey] of Object.entries(selectedMap)) {
      const fieldDef = this._table.fields[propKey];
      this._attributes.push({ name: fieldDef.name, alias });
    }
    return this;
  }
  /**
   * Adds a filter condition to the FetchXML query.
   * Accepts a raw filter string or a callback that receives a field proxy.
   * Multiple `where()` calls are combined with AND.
   *
   * @example
   * // With callback
   * fetchXml(contactTable).where(f => condition(f.status, "eq", 1))
   *
   * @example
   * // Raw filter string
   * fetchXml(contactTable).where(condition("statuscode", "eq", "1"))
   */
  where(filter) {
    const str = typeof filter === "function" ? filter(this._proxy) : filter;
    this._filters.push(str);
    return this;
  }
  /**
   * Adds a link-entity join to another table. The result type merges the
   * joined entity's selected fields.
   *
   * @example
   * fetchXml(contactTable)
   *   .select(f => ({ name: f.name }))
   *   .join("inner", accountTable, a => a.accountid, c => c.parentcustomerid,
   *     q => q.select(a => ({ accountName: a.name })))
   */
  join(linkType, table, from, to, subquery, intersect) {
    const nestedBuilder = new EntityQueryBuilder(table);
    subquery(nestedBuilder);
    const fromFieldName = table.fields[from].name;
    const toFieldName = this._table.fields[to].name;
    const autoAlias = `auto_link_${++this._aliasCounter}`;
    this._links.push({
      name: table.name,
      from: fromFieldName,
      to: toFieldName,
      alias: autoAlias,
      linkType,
      builder: nestedBuilder,
      intersect
    });
    return this;
  }
  /**
   * Shorthand for `join("inner", ...)`. Adds an inner link-entity join.
   *
   * @example
   * fetchXml(contactTable)
   *   .select(f => ({ name: f.name }))
   *   .innerJoin(accountTable, a => a.accountid, c => c.parentcustomerid,
   *     q => q.select(a => ({ accountName: a.name })))
   */
  innerJoin(table, from, to, subquery, intersect) {
    return this.join("inner", table, from, to, subquery, intersect);
  }
  /** Enables distinct (deduplicated) results. */
  distinct() {
    this._isDistinct = true;
    return this;
  }
  /** Limits the number of returned records. */
  top(n) {
    this._top = n;
    return this;
  }
  /** Sets the page number for paginated results. */
  page(n) {
    this._page = n;
    return this;
  }
  /** Sets the number of records per page. */
  pageSize(n) {
    this._pageSize = n;
    return this;
  }
  /** Requests the server to include the total record count. */
  returnTotalRecordCount() {
    this._returnTotalRecordCount = true;
    return this;
  }
  /** Instructs the server to use the raw order-by string. */
  useRawOrderBy() {
    this._useRawOrderBy = true;
    return this;
  }
  /** Enables late materialization for better performance on large datasets. */
  lateMaterialize() {
    this._lateMaterialize = true;
    return this;
  }
  /** Sets the aggregate limit for grouped results. */
  aggregateLimit(n) {
    this._aggregateLimit = n;
    return this;
  }
  /** Sets custom query options. */
  options(value) {
    this._options = value;
    return this;
  }
  /** Sets an alternate datasource (e.g. for federated queries). */
  datasource(value) {
    this._datasource = value;
    return this;
  }
  /** Marks the query as an aggregate (grouped) query. */
  aggregate() {
    this._isAggregate = true;
    return this;
  }
  orderby(...args) {
    if (typeof args[0] === "function") {
      const result = args[0](this._proxy);
      if (result instanceof OrderSpec) {
        for (const attr of result.fields) {
          this._orders.push({ attribute: attr, descending: result.direction === "desc" });
        }
      } else if (Array.isArray(result)) {
        for (const spec of result) {
          for (const attr of spec.fields) {
            this._orders.push({ attribute: attr, descending: spec.direction === "desc" });
          }
        }
      } else {
        for (const [attr, dir] of Object.entries(result)) {
          this._orders.push({ attribute: attr, descending: dir === "desc" });
        }
      }
    } else {
      const entityname = args[0];
      const attribute = args[1];
      const direction = args[2];
      this._orders.push({ attribute, entityname, descending: direction === "desc" });
    }
    return this;
  }
  /** Adds a SUM aggregate. Marks the query as aggregate. */
  sum(field, alias) {
    this._isAggregate = true;
    const fieldDef = this._table.fields[field];
    this._attributes.push({ name: fieldDef.name, alias, aggregate: "sum" });
    return this;
  }
  /** Adds an AVG aggregate. Marks the query as aggregate. */
  avg(field, alias) {
    this._isAggregate = true;
    const fieldDef = this._table.fields[field];
    this._attributes.push({ name: fieldDef.name, alias, aggregate: "avg" });
    return this;
  }
  /** Adds a MIN aggregate. Marks the query as aggregate. */
  min(field, alias) {
    this._isAggregate = true;
    const fieldDef = this._table.fields[field];
    this._attributes.push({ name: fieldDef.name, alias, aggregate: "min" });
    return this;
  }
  /** Adds a MAX aggregate. Marks the query as aggregate. */
  max(field, alias) {
    this._isAggregate = true;
    const fieldDef = this._table.fields[field];
    this._attributes.push({ name: fieldDef.name, alias, aggregate: "max" });
    return this;
  }
  /** Adds a COUNT aggregate. Marks the query as aggregate. */
  count(field, alias) {
    this._isAggregate = true;
    const fieldDef = this._table.fields[field];
    this._attributes.push({ name: fieldDef.name, alias, aggregate: "count" });
    return this;
  }
  /** Adds a COUNTCOLUMN aggregate with optional distinct flag. Marks the query as aggregate. */
  countColumn(field, alias, distinct) {
    this._isAggregate = true;
    const fieldDef = this._table.fields[field];
    this._attributes.push({ name: fieldDef.name, alias, aggregate: "countcolumn", distinct });
    return this;
  }
  /** Adds a custom row aggregate. */
  rowAggregate(field, alias, rowaggregate) {
    const fieldDef = this._table.fields[field];
    this._attributes.push({ name: fieldDef.name, alias, rowaggregate });
    return this;
  }
  /** Adds a GROUP BY on a field. Marks the query as aggregate. */
  groupBy(field, alias) {
    this._isAggregate = true;
    const fieldDef = this._table.fields[field];
    this._attributes.push({ name: fieldDef.name, alias, groupby: true });
    return this;
  }
  /** Adds a GROUP BY with date grouping (e.g. "day", "month", "year"). Marks the query as aggregate. */
  groupByDate(field, alias, dategrouping) {
    this._isAggregate = true;
    const fieldDef = this._table.fields[field];
    this._attributes.push({ name: fieldDef.name, alias, groupby: true, dategrouping });
    return this;
  }
  /** Sets the paging cookie for navigating paginated results. */
  pagingCookie(cookie) {
    this._pagingCookie = cookie;
    return this;
  }
  /**
   * Returns the full FetchXML string.
   *
   * @example
   * const xml = fetchXml(contactTable)
   *   .select(f => ({ name: f.name }))
   *   .toXml();
   * // <fetch version="1.0" mapping="logical">
   * //   <entity name="contact">
   * //     <attribute name="fullname" alias="name" />
   * //   </entity>
   * // </fetch>
   */
  toXml() {
    const lines = [];
    const fetchAttrs = [`version="1.0"`, `mapping="logical"`];
    if (this._top !== void 0) fetchAttrs.push(`top='${this._top}'`);
    if (this._isDistinct) fetchAttrs.push(`distinct="true"`);
    if (this._page !== void 0) fetchAttrs.push(`page='${this._page}'`);
    if (this._pageSize !== void 0) fetchAttrs.push(`count='${this._pageSize}'`);
    if (this._isAggregate) fetchAttrs.push(`aggregate="true"`);
    if (this._returnTotalRecordCount) fetchAttrs.push(`returntotalrecordcount="true"`);
    if (this._useRawOrderBy) fetchAttrs.push(`useraworderby="true"`);
    if (this._lateMaterialize) fetchAttrs.push(`latematerialize="true"`);
    if (this._aggregateLimit !== void 0) fetchAttrs.push(`aggregatelimit='${this._aggregateLimit}'`);
    if (this._pagingCookie) fetchAttrs.push(`paging-cookie='${this._pagingCookie}'`);
    if (this._datasource) fetchAttrs.push(`datasource='${this._datasource}'`);
    if (this._options) fetchAttrs.push(`options='${this._options}'`);
    lines.push(`<fetch ${fetchAttrs.join(" ")}>`);
    lines.push(`  <entity name="${this._table.name}">`);
    for (const attr of this._attributes) {
      const attrParts = [`name="${attr.name}"`, `alias="${attr.alias}"`];
      if (attr.aggregate) attrParts.push(`aggregate='${attr.aggregate}'`);
      if (attr.groupby) attrParts.push(`groupby='true'`);
      if (attr.dategrouping) attrParts.push(`dategrouping='${attr.dategrouping}'`);
      if (attr.distinct) attrParts.push(`distinct='true'`);
      if (attr.rowaggregate) attrParts.push(`rowaggregate='${attr.rowaggregate}'`);
      lines.push(`    <attribute ${attrParts.join(" ")} />`);
    }
    for (const order of this._orders) {
      const parts = [];
      if (order.entityname) parts.push(`entityname='${order.entityname}'`);
      parts.push(`attribute='${order.attribute}'`);
      if (order.descending) parts.push(`descending='true'`);
      lines.push(`    <order ${parts.join(" ")} />`);
    }
    if (this._filters.length > 0) {
      lines.push(`    <filter type="and">`);
      for (const c of this._filters) {
        lines.push(`      ${c}`);
      }
      lines.push(`    </filter>`);
    }
    for (const link of this._links) {
      const linkAttrs = [
        `name="${link.name}"`,
        `from="${link.from}"`,
        `to="${link.to}"`,
        `alias="${link.alias}"`,
        `link-type="${link.linkType}"`
      ];
      if (link.intersect) linkAttrs.push(`intersect="true"`);
      lines.push(`    <link-entity ${linkAttrs.join(" ")}>`);
      if (link.builder._filters.length > 0) {
        lines.push(`      <filter type="and">`);
        for (const c of link.builder._filters) {
          const entityScoped = c.replace("<condition", `<condition entityname="${link.alias}"`);
          lines.push(`        ${entityScoped}`);
        }
        lines.push(`      </filter>`);
      }
      for (const nestedAttr of link.builder._attributes) {
        const attrParts = [`name="${nestedAttr.name}"`, `alias="${nestedAttr.alias}"`];
        if (nestedAttr.aggregate) attrParts.push(`aggregate='${nestedAttr.aggregate}'`);
        if (nestedAttr.groupby) attrParts.push(`groupby='true'`);
        if (nestedAttr.dategrouping) attrParts.push(`dategrouping='${nestedAttr.dategrouping}'`);
        if (nestedAttr.distinct) attrParts.push(`distinct='true'`);
        if (nestedAttr.rowaggregate) attrParts.push(`rowaggregate='${nestedAttr.rowaggregate}'`);
        lines.push(`      <attribute ${attrParts.join(" ")} />`);
      }
      lines.push(`    </link-entity>`);
    }
    lines.push(`  </entity>`);
    lines.push(`</fetch>`);
    return lines.join("\n");
  }
  /**
   * Returns the URL-encoded query string for use in the Dataverse API.
   *
   * @example
   * fetchXml(contactTable).select(f => ({ name: f.name })).toString()
   * // "fetchXml=%3Cfetch%20version%3D%221.0%22..."
   */
  toString() {
    return `fetchXml=${encodeURIComponent(this.toXml())}`;
  }
  /**
   * Executes the FetchXML query against Dataverse and returns the parsed results.
   *
   * @example
   * const contacts = await fetchXml(contactTable)
   *   .select(f => ({ name: f.name, email: f.email }))
   *   .where(f => condition(f.status, "eq", 1))
   *   .execute();
   * // contacts: Array<{ name: string; email: string }>
   */
  async execute() {
    const raw = await this._table.client.getRecords(this._table.name, this.toString());
    return raw.map((v) => this._table.transformValueFromDataverse(v));
  }
}
function condition(attribute, operator, value) {
  return `<condition attribute="${attribute}" operator="${operator}" value="${value}" />`;
}
function filterAnd(...conditions) {
  return `<filter type="and">${conditions.join("")}</filter>`;
}
function filterOr(...conditions) {
  return `<filter type="or">${conditions.join("")}</filter>`;
}
function fetchXml(table) {
  return new EntityQueryBuilder(table);
}

export { Above, AboveOrEqual, Between, BooleanField, CollectionIdsProperty, CollectionProperty, ContainsValues, DataverseClient, DateField, DateTimeField, DoesNotContainValues, EntityQueryBuilder, EqualBusinessId, EqualUserId, EqualUserLanguage, EqualUserOrUserHierarchy, EqualUserOrUserHierarchyAndTeams, EqualUserOrUserTeams, Etag, FileField, FormattedField, ImageField, In, InFiscalPeriod, InFiscalPeriodAndYear, InFiscalYear, InOrAfterFiscalPeriodAndYear, InOrBeforeFiscalPeriodAndYear, Last7Days, LastFiscalPeriod, LastFiscalYear, LastMonth, LastWeek, LastXDays, LastXFiscalPeriods, LastXFiscalYears, LastXHours, LastXMonths, LastXWeeks, LastXYears, LastYear, ListField, LookupIdProperty, LookupProperty, Next7Days, NextFiscalPeriod, NextFiscalYear, NextMonth, NextWeek, NextXDays, NextXFiscalPeriods, NextXFiscalYears, NextXHours, NextXMonths, NextXWeeks, NextXYears, NextYear, NotBetween, NotEqualBusinessId, NotEqualUserId, NotIn, NotUnder, NullableDateField, NullableDateTimeField, NullableNumberField, NullableStringField, NumberField, ODataQuery, OlderThanXDays, OlderThanXHours, OlderThanXMinutes, OlderThanXMonths, OlderThanXWeeks, OlderThanXYears, On, OnOrAfter, OnOrBefore, OrderSpec, PrimaryKeyField, RetrieveAadUserRoles, RetrieveChoices, RetrieveTotalRecordCount, Schema, StringField, Table, ThisFiscalPeriod, ThisFiscalYear, ThisMonth, ThisWeek, ThisYear, Today, Tomorrow, Under, UnderOrEqual, WhoAmI, Yesterday, aggregate, all, and, any, asc, attachEtag, average, base64ImageToURL, boolean, collection, collectionIds, compare, condition, contains, count, date, datetime, desc, email, endsWith, equals, expand, fetchOdata, fetchXML, fetchXml, file, filterAnd, filterOr, formatted, getEtag, getImageUrl, getName, greaterThan, greaterThanOrEqual, groupby, image, integer, isActive, isInactive, isNonEmptyString, isNotNull, isNull, isType, isTypeOrNull, keys, lessThan, lessThanOrEqual, list, lookup, lookupId, mapChoices, max, maxLength, maxValue, mergeRecords, min, minLength, minValue, not, notEquals, nullableDate, nullableDateTime, nullableNumber, nullableString, number, numeric, or, orderby, parseDateOnly, pattern, primaryKey, query, required, select, startsWith, string, sum, table, toBase64, toDateOnly, wrapString, xml };
