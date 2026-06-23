const Etag = Symbol("etag");
const rxGUID = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/i;
const rxDateOnly = /^\d{4}-\d{2}-\d{2}$/;
function isNonEmptyString(value) {
  return typeof value === "string" && value.length > 0;
}
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

function queryString(opts) {
  const params = new URLSearchParams();
  if (opts.select) params.set("$select", opts.select);
  if (opts.top !== void 0) params.set("$top", opts.top.toFixed(0));
  if (opts.filter) params.set("$filter", opts.filter);
  if (opts.orderby) params.set("$orderby", opts.orderby);
  if (opts.expand) params.set("$expand", opts.expand);
  return params.toString();
}
class DataverseTable extends Schema {
  client;
  fields;
  logicalName;
  entitySetName;
  kind = "table";
  type = "table";
  /**
   * @param options Options including the DataverseClient, entity set name, logical name, and field definitions.
   */
  constructor(options) {
    super(options.entitySetName, null);
    this.client = options.client;
    this.entitySetName = options.entitySetName;
    this.logicalName = options.logicalName;
    this.fields = options.fields;
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
    return this.client.getRecord(this.entitySetName, id, buildQuery(this)).then((v) => this.transformValueFromDataverse(v));
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
    return this.client.getRecords(this.entitySetName, buildQuery(this, queryOptions)).then((values) => values.map((v) => this.transformValueFromDataverse(v)));
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
      return this.client.getPropertyValue(this.entitySetName, id, prop.name).then((v) => prop.transformValueFromDataverse(v));
    }
    if (prop.type === "collection" || prop.type === "collectionIds") {
      return this.client.getAssociatedRecords(
        this.entitySetName,
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
        this.entitySetName,
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
        this.entitySetName,
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
          this.entitySetName,
          id,
          property.name,
          property.table.entitySetName,
          property.table.getPrimaryKey().property.name,
          ids
        );
      }
    }
    if (property.type === "lookup" || property.type == "lookupId") {
      const name = property.type === "lookup" ? property.name : property.navigationName;
      if (value === null) {
        return this.client.dissociateRecord(this.entitySetName, id, name);
      } else {
        const childId = property.type === "lookup" ? await property.table.upsertRecord(void 0, value) : value;
        return this.client.associateRecord(
          this.entitySetName,
          id,
          name,
          property.table.entitySetName,
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
        this.entitySetName,
        id,
        prop.name,
        prop.table.entitySetName,
        childId
      );
    } else {
      throw new Error("Can only associate to navigation properties");
    }
  }
  async dissociateRecord(key, id, childId) {
    const prop = this.fields[key];
    if (prop.kind === "navigation") {
      return this.client.dissociateRecord(this.entitySetName, id, prop.name, childId);
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
      this.entitySetName,
      this.transformValueToDataverse(value),
      queryString({ select: pkName })
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
      this.entitySetName,
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
          this.entitySetName,
          id,
          this.transformValueToDataverse(value),
          queryString({ select: pkName }),
          etag
        )
      );
    } else {
      const record = await this.client.postRecord(
        this.entitySetName,
        this.transformValueToDataverse(value),
        queryString({ select: pkName })
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
    return this.client.deleteRecord(this.entitySetName, id, etag);
  }
  /**
   * Activates a record by setting its `statecode` to 0.
   *
   * @example
   * await Person.activateRecord("some-guid");
   */
  async activateRecord(id) {
    return this.client.activateRecord(this.entitySetName, id);
  }
  /**
   * Deactivates a record by setting its `statecode` to 1.
   *
   * @example
   * await Person.deactivateRecord("some-guid");
   */
  async deactivateRecord(id) {
    return this.client.deactivateRecord(this.entitySetName, id);
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
      return this.client.deletePropertyValue(this.entitySetName, id, prop.name);
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
      return this.client.executeBoundAction(this.entitySetName, actionName, params, id);
    }
    return this.client.executeBoundAction(this.entitySetName, actionName, params);
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
    return this.client.executeBoundFunction(this.entitySetName, id, functionName, params);
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
      this.entitySetName,
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
      this.entitySetName,
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
    return this.client.deleteMultiple(this.entitySetName, ids);
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
    result[Etag] = value["@odata.etag"];
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
    return new DataverseTable({ client: this.client, entitySetName: this.entitySetName, logicalName: this.logicalName, fields: properties });
  }
  /**
   * Creates a new `DataverseTable` with the specified properties excluded.
   *
   * @example
   * const WithoutSensitive = Person.omitProperties("ssn");
   */
  omitProperties(...keys) {
    const properties = Object.fromEntries(
      Object.entries(this.fields).filter((v) => !keys.includes(v[0]))
    );
    return new DataverseTable({ client: this.client, entitySetName: this.entitySetName, logicalName: this.logicalName, fields: properties });
  }
  /**
   * Creates a new `DataverseTable` with additional properties appended.
   *
   * @example
   * const Extended = Account.appendProperties({
   *   customField: string("new_stringcolumn"),
   * });
   * // Extended has all original fields plus `customField`
   */
  appendProperties(properties) {
    return new DataverseTable({ client: this.client, entitySetName: this.entitySetName, logicalName: this.logicalName, fields: {
      ...this.fields,
      ...properties
    } });
  }
  /** Use for type inference: `Infer<typeof Account>` resolves to the record type. */
  T;
}
function buildQuery(table, q) {
  return queryString({
    top: q?.top,
    filter: q?.filter,
    orderby: q?.orderby ? Object.entries(q?.orderby ?? {}).map(([key, value]) => `${table.fields[key].name} ${value}`).join(",") : void 0,
    select: buildSelect(table),
    expand: buildExpand(table)
  });
}
function buildSelect(table) {
  return Object.values(table.fields).filter((v) => v.kind === "value" || v.type === "lookupId" || v.type === "file").map((v) => v.fromDataverseName).join(",");
}
function buildExpand(table, depth = 0) {
  if (depth > 3) return "";
  return Object.values(table.fields).filter(
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
class DataverseIntersectTable {
  /** Marks this table as an intersect table for FetchXML joins. */
  intersect = true;
  /**
   * The intersect table name used in FetchXML `<link-entity name="...">`.
   * This is the Dataverse entity logical name (e.g. `"accountcontact"`).
   * It is NOT an entity set name (no pluralization) — unlike {@link DataverseTable.entitySetName}
   * and {@link DataverseTable.logicalName}, this single `name` serves both roles
   * for intersect table references in FetchXML join syntax.
   */
  name;
  /** The first related table. */
  table1;
  /** The second related table. */
  table2;
  constructor(name, table1, table2) {
    this.name = name;
    this.table1 = table1;
    this.table2 = table2;
  }
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
      this.#table = new DataverseTable({ client: table.client, entitySetName: table.name, logicalName: table.name, fields: { id: property } });
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
      this.#table = new DataverseTable({ client: table.client, entitySetName: table.name, logicalName: table.name, fields: { id: property } });
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

class FilterExpr {
  constructor(node) {
    this.node = node;
  }
  toString() {
    return this.toOdata();
  }
  toOdata() {
    return serializeOdata(this.node);
  }
  toFetchXml() {
    return serializeFetchXml(this.node);
  }
}
function serializeOdata(node) {
  switch (node.type) {
    case "comparison":
      return `(${node.field} ${node.operator} ${wrapString(node.value)})`;
    case "null":
      return `${node.field} ${node.positive ? "eq" : "ne"} null`;
    case "contains":
      return `contains(${node.field},${wrapString(node.value)})`;
    case "startsWith":
      return `startswith(${node.field},${wrapString(node.value)})`;
    case "endsWith":
      return `endswith(${node.field},${wrapString(node.value)})`;
    case "compare":
      return `(${node.field} ${node.operator} ${node.otherField})`;
    case "lambda":
      return `${node.field}/${node.operator}(${node.alias}: ${node.condition})`;
    case "fn": {
      const field = wrapString(node.field);
      const vals = node.values.map(wrapString);
      if (vals.length === 0) {
        return `Microsoft.Dynamics.CRM.${node.fnName}(PropertyName=${field})`;
      }
      if (vals.length === 1) {
        return `Microsoft.Dynamics.CRM.${node.fnName}(PropertyName=${field},PropertyValue=${vals[0]})`;
      }
      if (node.fnName === "Between" || node.fnName === "NotBetween") {
        return `Microsoft.Dynamics.CRM.${node.fnName}(PropertyName=${field},PropertyValues=[${vals.join(",")}])`;
      }
      if (node.fnName === "InFiscalPeriodAndYear" || node.fnName === "InOrAfterFiscalPeriodAndYear" || node.fnName === "InOrBeforeFiscalPeriodAndYear") {
        return `Microsoft.Dynamics.CRM.${node.fnName}(PropertyName=${field},PropertyValue1=${vals[0]},PropertyValue2=${vals[1]})`;
      }
      return `Microsoft.Dynamics.CRM.${node.fnName}(PropertyName=${field},PropertyValues=[${vals.join(",")}])`;
    }
    case "raw":
      return node.value;
    case "and":
      if (node.conditions.length === 0) return "";
      return `(${node.conditions.map((c) => c.toOdata()).join(" and ")})`;
    case "or":
      if (node.conditions.length === 0) return "";
      return `(${node.conditions.map((c) => c.toOdata()).join(" or ")})`;
    case "not":
      return `not(${node.condition.toOdata()})`;
  }
}
function escapeXml(value) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}
function serializeFetchXml(node) {
  switch (node.type) {
    case "comparison": {
      const value = node.value === null ? "" : escapeXml(String(node.value));
      return `<condition attribute="${escapeXml(node.field)}" operator="${escapeXml(node.operator)}" value="${value}" />`;
    }
    case "null":
      return `<condition attribute="${escapeXml(node.field)}" operator="${node.positive ? "null" : "not-null"}" />`;
    case "contains":
      return `<condition attribute="${escapeXml(node.field)}" operator="like" value="%${escapeXml(node.value)}%" />`;
    case "startsWith":
      return `<condition attribute="${escapeXml(node.field)}" operator="begins-with" value="${escapeXml(node.value)}" />`;
    case "endsWith":
      return `<condition attribute="${escapeXml(node.field)}" operator="ends-with" value="${escapeXml(node.value)}" />`;
    case "compare":
      return `<condition attribute="${escapeXml(node.field)}" operator="${escapeXml(node.operator)}" valueof="${escapeXml(node.otherField)}" />`;
    case "lambda":
      return `<condition entityname="${escapeXml(node.field)}" operator="${escapeXml(node.operator)}" value="${escapeXml(`${node.alias}: ${node.condition}`)}" />`;
    case "fn": {
      const attr = escapeXml(node.field);
      const op = escapeXml(node.operator);
      if (node.values.length === 0) {
        return `<condition attribute="${attr}" operator="${op}" />`;
      }
      if (node.values.length === 1) {
        return `<condition attribute="${attr}" operator="${op}" value="${escapeXml(String(node.values[0]))}" />`;
      }
      return `<condition attribute="${attr}" operator="${op}">${node.values.map((v) => `<value>${escapeXml(String(v))}</value>`).join("")}</condition>`;
    }
    case "raw":
      return node.value;
    case "and":
      if (node.conditions.length === 0) return "";
      return `<filter type="and">${node.conditions.map((c) => c.toFetchXml()).join("")}</filter>`;
    case "or":
      if (node.conditions.length === 0) return "";
      return `<filter type="or">${node.conditions.map((c) => c.toFetchXml()).join("")}</filter>`;
    case "not":
      return `<filter type="and"><filter type="or">${node.condition.toFetchXml()}</filter></filter>`;
  }
}
function fn(field, fnName, operator, values) {
  return new FilterExpr({ type: "fn", field: getName(field), fnName, operator, values });
}
function eq(field, value) {
  return new FilterExpr({ type: "comparison", field: getName(field), operator: "eq", value });
}
function ne(field, value) {
  return new FilterExpr({ type: "comparison", field: getName(field), operator: "ne", value });
}
function gt(field, value) {
  return new FilterExpr({ type: "comparison", field: getName(field), operator: "gt", value });
}
function ge(field, value) {
  return new FilterExpr({ type: "comparison", field: getName(field), operator: "ge", value });
}
function lt(field, value) {
  return new FilterExpr({ type: "comparison", field: getName(field), operator: "lt", value });
}
function le(field, value) {
  return new FilterExpr({ type: "comparison", field: getName(field), operator: "le", value });
}
function isNull(field) {
  return new FilterExpr({ type: "null", field: getName(field), positive: true });
}
function isNotNull(field) {
  return new FilterExpr({ type: "null", field: getName(field), positive: false });
}
function contains(field, value) {
  return new FilterExpr({ type: "contains", field: getName(field), value });
}
function startsWith(field, value) {
  return new FilterExpr({ type: "startsWith", field: getName(field), value });
}
function endsWith(field, value) {
  return new FilterExpr({ type: "endsWith", field: getName(field), value });
}
function compare(field, operator, otherField) {
  return new FilterExpr({ type: "compare", field: getName(field), operator, otherField: getName(otherField) });
}
function and(...conditions) {
  const valid = conditions.filter((c) => c != null && c !== "");
  const exprs = valid.map((c) => typeof c === "string" ? new FilterExpr({ type: "raw", value: c }) : c);
  return new FilterExpr({ type: "and", conditions: exprs });
}
function or(...conditions) {
  const valid = conditions.filter((c) => c != null && c !== "");
  const exprs = valid.map((c) => typeof c === "string" ? new FilterExpr({ type: "raw", value: c }) : c);
  return new FilterExpr({ type: "or", conditions: exprs });
}
function not(condition) {
  const c = typeof condition === "string" ? new FilterExpr({ type: "raw", value: condition }) : condition;
  return new FilterExpr({ type: "not", condition: c });
}
function isActive() {
  return eq("statecode", 0);
}
function isInactive() {
  return eq("statecode", 1);
}
function Above(field, value) {
  return fn(field, "Above", "above", [value]);
}
function AboveOrEqual(field, value) {
  return fn(field, "AboveOrEqual", "above-or-equal", [value]);
}
function Between(field, value1, value2) {
  return fn(field, "Between", "between", [value1, value2]);
}
function ContainsValues(field, values) {
  return fn(field, "ContainsValues", "in", values);
}
function DoesNotContainValues(field, values) {
  return fn(field, "DoesNotContainValues", "not-in", values);
}
function EqualBusinessId(field) {
  return fn(field, "EqualBusinessId", "eq-businessid", []);
}
function EqualUserId(field) {
  return fn(field, "EqualUserId", "eq-userid", []);
}
function EqualUserLanguage(field) {
  return fn(field, "EqualUserLanguage", "eq-userlanguage", []);
}
function EqualUserOrUserHierarchy(field) {
  return fn(field, "EqualUserOrUserHierarchy", "eq-useroruserhierarchy", []);
}
function EqualUserOrUserHierarchyAndTeams(field) {
  return fn(field, "EqualUserOrUserHierarchyAndTeams", "eq-useroruserhierarchyandteams", []);
}
function EqualUserOrUserTeams(field) {
  return fn(field, "EqualUserOrUserTeams", "eq-useroruserteams", []);
}
function In(field, values) {
  return fn(field, "In", "in", values);
}
function InFiscalPeriod(field, value) {
  return fn(field, "InFiscalPeriod", "in-fiscal-period", [value]);
}
function InFiscalPeriodAndYear(field, fiscalPeriod, fiscalYear) {
  return fn(field, "InFiscalPeriodAndYear", "in-fiscal-period-and-year", [fiscalPeriod, fiscalYear]);
}
function InFiscalYear(field, value) {
  return fn(field, "InFiscalYear", "in-fiscal-year", [value]);
}
function InOrAfterFiscalPeriodAndYear(field, fiscalPeriod, fiscalYear) {
  return fn(field, "InOrAfterFiscalPeriodAndYear", "in-or-after-fiscal-period-and-year", [fiscalPeriod, fiscalYear]);
}
function InOrBeforeFiscalPeriodAndYear(field, fiscalPeriod, fiscalYear) {
  return fn(field, "InOrBeforeFiscalPeriodAndYear", "in-or-before-fiscal-period-and-year", [fiscalPeriod, fiscalYear]);
}
function Last7Days(field) {
  return fn(field, "Last7Days", "last-seven-days", []);
}
function LastFiscalPeriod(field) {
  return fn(field, "LastFiscalPeriod", "last-fiscal-period", []);
}
function LastFiscalYear(field) {
  return fn(field, "LastFiscalYear", "last-fiscal-year", []);
}
function LastMonth(field) {
  return fn(field, "LastMonth", "last-month", []);
}
function LastWeek(field) {
  return fn(field, "LastWeek", "last-week", []);
}
function LastXDays(field, value) {
  return fn(field, "LastXDays", "last-x-days", [value]);
}
function LastXFiscalPeriods(field, value) {
  return fn(field, "LastXFiscalPeriods", "last-x-fiscal-periods", [value]);
}
function LastXFiscalYears(field, value) {
  return fn(field, "LastXFiscalYears", "last-x-fiscal-years", [value]);
}
function LastXHours(field, value) {
  return fn(field, "LastXHours", "last-x-hours", [value]);
}
function LastXMonths(field, value) {
  return fn(field, "LastXMonths", "last-x-months", [value]);
}
function LastXWeeks(field, value) {
  return fn(field, "LastXWeeks", "last-x-weeks", [value]);
}
function LastXYears(field, value) {
  return fn(field, "LastXYears", "last-x-years", [value]);
}
function LastYear(field) {
  return fn(field, "LastYear", "last-year", []);
}
function Next7Days(field) {
  return fn(field, "Next7Days", "next-seven-days", []);
}
function NextFiscalPeriod(field) {
  return fn(field, "NextFiscalPeriod", "next-fiscal-period", []);
}
function NextFiscalYear(field) {
  return fn(field, "NextFiscalYear", "next-fiscal-year", []);
}
function NextMonth(field) {
  return fn(field, "NextMonth", "next-month", []);
}
function NextWeek(field) {
  return fn(field, "NextWeek", "next-week", []);
}
function NextXDays(field, value) {
  return fn(field, "NextXDays", "next-x-days", [value]);
}
function NextXFiscalPeriods(field, value) {
  return fn(field, "NextXFiscalPeriods", "next-x-fiscal-periods", [value]);
}
function NextXFiscalYears(field, value) {
  return fn(field, "NextXFiscalYears", "next-x-fiscal-years", [value]);
}
function NextXHours(field, value) {
  return fn(field, "NextXHours", "next-x-hours", [value]);
}
function NextXMonths(field, value) {
  return fn(field, "NextXMonths", "next-x-months", [value]);
}
function NextXWeeks(field, value) {
  return fn(field, "NextXWeeks", "next-x-weeks", [value]);
}
function NextXYears(field, value) {
  return fn(field, "NextXYears", "next-x-years", [value]);
}
function NextYear(field) {
  return fn(field, "NextYear", "next-year", []);
}
function NotBetween(field, value1, value2) {
  return fn(field, "NotBetween", "not-between", [value1, value2]);
}
function NotEqualBusinessId(field) {
  return fn(field, "NotEqualBusinessId", "neq-businessid", []);
}
function NotEqualUserId(field) {
  return fn(field, "NotEqualUserId", "neq-userid", []);
}
function NotIn(field, values) {
  return fn(field, "NotIn", "not-in", values);
}
function NotUnder(field, value) {
  return fn(field, "NotUnder", "not-under", [value]);
}
function OlderThanXDays(field, value) {
  return fn(field, "OlderThanXDays", "olderthan-x-days", [value]);
}
function OlderThanXHours(field, value) {
  return fn(field, "OlderThanXHours", "olderthan-x-hours", [value]);
}
function OlderThanXMinutes(field, value) {
  return fn(field, "OlderThanXMinutes", "olderthan-x-minutes", [value]);
}
function OlderThanXMonths(field, value) {
  return fn(field, "OlderThanXMonths", "olderthan-x-months", [value]);
}
function OlderThanXWeeks(field, value) {
  return fn(field, "OlderThanXWeeks", "olderthan-x-weeks", [value]);
}
function OlderThanXYears(field, value) {
  return fn(field, "OlderThanXYears", "olderthan-x-years", [value]);
}
function On(field, value) {
  return fn(field, "On", "on", [value]);
}
function OnOrAfter(field, value) {
  return fn(field, "OnOrAfter", "on-or-after", [value]);
}
function OnOrBefore(field, value) {
  return fn(field, "OnOrBefore", "on-or-before", [value]);
}
function ThisFiscalPeriod(field) {
  return fn(field, "ThisFiscalPeriod", "this-fiscal-period", []);
}
function ThisFiscalYear(field) {
  return fn(field, "ThisFiscalYear", "this-fiscal-year", []);
}
function ThisMonth(field) {
  return fn(field, "ThisMonth", "this-month", []);
}
function ThisWeek(field) {
  return fn(field, "ThisWeek", "this-week", []);
}
function ThisYear(field) {
  return fn(field, "ThisYear", "this-year", []);
}
function Today(field) {
  return fn(field, "Today", "today", []);
}
function Tomorrow(field) {
  return fn(field, "Tomorrow", "tomorrow", []);
}
function Under(field, value) {
  return fn(field, "Under", "under", [value]);
}
function UnderOrEqual(field, value) {
  return fn(field, "UnderOrEqual", "under-or-equal", [value]);
}
function Yesterday(field) {
  return fn(field, "Yesterday", "yesterday", []);
}

const proxyTableMap = /* @__PURE__ */ new WeakMap();
class Aggregation {
  constructor(operation, field, alias) {
    this.operation = operation;
    this.field = field;
    this.alias = alias;
  }
  /** OData format (e.g. `"title with average as avg_title"`). */
  toOdata(alias) {
    const a = alias ?? this.alias;
    if (this.operation === "count" || this.operation === "countdistinct") {
      return a ? `$count as ${a}` : `$count`;
    }
    const resolvedAlias = a ?? this.field;
    return `${this.field} with ${this.operation} as ${resolvedAlias}`;
  }
  /** FetchXML format (e.g. `name="title" alias="avg_title" aggregate="avg"`). */
  toXml(alias) {
    if (!this.field) return "";
    const a = alias ?? this.alias ?? this.field;
    return `name="${this.field}" alias="${a}" aggregate="${this.operation}"`;
  }
  toString() {
    return this.toOdata();
  }
}
function avg(name, alias) {
  return new Aggregation("average", name, alias);
}
function sum(name, alias) {
  return new Aggregation("sum", name, alias);
}
function min(name, alias) {
  return new Aggregation("min", name, alias);
}
function max(name, alias) {
  return new Aggregation("max", name, alias);
}
function count(fieldOrAlias, alias) {
  if (fieldOrAlias === void 0) {
    return new Aggregation("count", void 0, alias);
  }
  if (alias !== void 0) {
    return new Aggregation("count", fieldOrAlias, alias);
  }
  return new Aggregation("count", fieldOrAlias);
}
class ODataQuery {
  _table;
  _fields = [];
  _selectedKeys = [];
  _filters = [];
  _expands = [];
  _orderby = [];
  _top;
  _apply = "";
  _hasGroupby = false;
  _expandMode = "full";
  _proxy;
  constructor(table) {
    this._table = table;
    this._proxy = this._buildProxy();
    this._selectDefaults();
  }
  _selectDefaults() {
    for (const prop of Object.values(this._table.fields)) {
      if (prop.kind === "value" || prop.type === "lookupId" || prop.type === "file") {
        this._fields.push(prop.fromDataverseName ?? prop.name);
      }
    }
  }
  _buildProxy() {
    return this._buildProxyForDataverseTable(this._table);
  }
  _buildProxyForDataverseTable(table, prefix) {
    const proxy = {};
    const fields = table.fields;
    for (const [key, prop] of Object.entries(fields)) {
      const dataverseName = prop.fromDataverseName ?? prop.name;
      const isCollection = prop.kind === "navigation" && prop.type === "collection";
      const isLookup = prop.kind === "navigation" && prop.type === "lookup";
      if (isCollection || isLookup) {
        const navProp = prop;
        const currentPrefix = prefix ? `${prefix}/${dataverseName}` : dataverseName;
        let cached;
        Object.defineProperty(proxy, key, {
          get: () => {
            if (!cached) {
              const sub = this._buildProxyForDataverseTable(navProp.table, currentPrefix);
              sub.toString = () => dataverseName;
              if (isCollection) {
                proxyTableMap.set(sub, navProp.table);
              }
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
   * By default, all value columns are selected.
   *
   * @param keys One or more value-field keys (navigation properties are excluded).
   *
   * @example
   * fetchOdata(Person).select("name", "age");
   */
  select(...keys) {
    if (this._hasGroupby) throw new Error("select() is not supported after groupby()");
    this._fields = keys.map((k) => this._proxy[k]);
    this._selectedKeys = keys;
    return this;
  }
  where(filter) {
    let str;
    if (filter instanceof FilterExpr) {
      str = filter.toOdata();
    } else if (typeof filter === "function") {
      const result = filter(this._proxy);
      str = result instanceof FilterExpr ? result.toOdata() : result;
    } else {
      str = filter;
    }
    this._filters.push(str);
    return this;
  }
  expand(key, sub) {
    if (this._hasGroupby) throw new Error("expand() is not supported after groupby()");
    const prop = this._table.fields[key];
    const isCollection = prop.type === "collection";
    if (this._expandMode === "collection" && isCollection) {
      throw new Error("expand() within a collection expand only supports lookup navigation properties");
    }
    const child = new ODataQuery(prop.table);
    child._expandMode = isCollection ? "collection" : "lookup";
    const result = sub?.(child);
    const q = result ?? child;
    this._expands.push({ name: prop.name, key, query: q._build(true) });
    return this;
  }
  /**
   * Adds a `$orderby` clause. The callback receives a field proxy to select
   * a field. Direction defaults to `"asc"`. Multiple calls accumulate.
   *
   * @example
   * fetchOdata(Person).orderby(f => f.name);
   * fetchOdata(Person).orderby(f => f.age, "desc");
   */
  orderby(fieldSelector, direction = "asc") {
    if (this._hasGroupby) throw new Error("orderby() is not supported after groupby()");
    if (this._expandMode === "lookup") throw new Error("orderby() is not supported in lookup expands");
    this._orderby.push({ name: fieldSelector(this._proxy), dir: direction });
    return this;
  }
  /** Limits the number of returned records (`$top`). */
  top(n) {
    if (this._expandMode === "lookup") throw new Error("top() is not supported in lookup expands");
    this._top = n;
    return this;
  }
  groupby(selectFields, aggFields) {
    if (this._hasGroupby) throw new Error("groupby() can only be called once");
    if (this._expandMode !== "full") throw new Error("groupby() is not supported in expand sub-queries");
    this._hasGroupby = true;
    const groupByNames = selectFields(this._proxy);
    const aggStrings = aggFields ? Object.entries(aggFields(this._proxy)).map(([alias, agg]) => agg.toOdata(alias)) : [];
    if (groupByNames.length > 0 && aggStrings.length > 0) {
      this._apply = `groupby((${groupByNames.join(",")}),aggregate(${aggStrings.join(",")}))`;
    } else if (groupByNames.length > 0) {
      this._apply = `groupby((${groupByNames.join(",")}))`;
    } else if (aggStrings.length > 0) {
      this._apply = `aggregate(${aggStrings.join(",")})`;
    }
    return this;
  }
  _build(forExpand = false) {
    const parts = [];
    const joinChar = forExpand ? ";" : "&";
    if (!this._hasGroupby) {
      if (this._fields.length) parts.push(`$select=${this._fields.join(",")}`);
      if (this._orderby.length) {
        parts.push(`$orderby=${this._orderby.map((o) => `${o.name} ${o.dir}`).join(",")}`);
      }
      if (this._expands.length) {
        parts.push(`$expand=${this._expands.map((e) => {
          return e.query ? `${e.name}(${e.query})` : e.name;
        }).join(",")}`);
      }
    }
    if (this._filters.length === 1) {
      parts.push(`$filter=${this._filters[0]}`);
    } else if (this._filters.length > 1) {
      parts.push(`$filter=${this._filters.join(" and ")}`);
    }
    if (this._top !== void 0) parts.push(`$top=${this._top}`);
    if (this._apply) parts.push(`$apply=${this._apply}`);
    return parts.join(joinChar);
  }
  toString() {
    return this._build();
  }
  _partialTransform(value) {
    const result = {};
    for (const key of this._selectedKeys) {
      const prop = this._table.fields[key];
      result[key] = prop.transformValueFromDataverse(value[prop.fromDataverseName]);
    }
    for (const expand of this._expands) {
      const prop = this._table.fields[expand.key];
      if (prop && value[expand.name] !== void 0) {
        result[expand.key] = prop.transformValueFromDataverse(value[expand.name]);
      }
    }
    result[Etag] = value["@odata.etag"];
    return result;
  }
  async execute() {
    const qs = this.toString();
    if (!qs) return this._table.getRecords();
    const raw = await this._table.client.getRecords(this._table.entitySetName, qs);
    if (this._selectedKeys.length > 0) {
      return raw.map((v) => this._partialTransform(v));
    }
    return raw.map((v) => this._table.transformValueFromDataverse(v));
  }
}
function buildLambdaProxy(alias, table) {
  const fields = table.fields;
  const proxy = {};
  for (const [key, prop] of Object.entries(fields)) {
    proxy[key] = `${alias}/${prop.fromDataverseName ?? prop.name}`;
  }
  return proxy;
}
function any(proxy, condition) {
  const alias = "x";
  const table = proxyTableMap.get(proxy);
  if (!table) throw new Error("any() requires a collection navigation proxy");
  const result = condition(buildLambdaProxy(alias, table));
  return new FilterExpr({ type: "lambda", field: String(proxy), operator: "any", alias, condition: result instanceof FilterExpr ? result.toOdata() : result });
}
function all(proxy, condition) {
  const alias = "x";
  const table = proxyTableMap.get(proxy);
  if (!table) throw new Error("all() requires a collection navigation proxy");
  const result = condition(buildLambdaProxy(alias, table));
  return new FilterExpr({ type: "lambda", field: String(proxy), operator: "all", alias, condition: result instanceof FilterExpr ? result.toOdata() : result });
}
function fetchOdata(table) {
  return new ODataQuery(table);
}

class EntityQueryBuilder {
  _linkAlias;
  _table;
  _attributes = [];
  _links = [];
  _isDistinct = false;
  _filters = [];
  _proxy;
  _top;
  _isAggregate = false;
  _useRawOrderBy = false;
  _lateMaterialize = false;
  _aggregateLimit;
  _orders = [];
  _datasource;
  _options;
  /** @param table The DataverseTable definition to build the query against. */
  constructor(table, _linkAlias) {
    this._table = table;
    this._linkAlias = _linkAlias ?? { value: 0 };
    this._proxy = this._buildProxy();
  }
  _getEffectiveAttributes() {
    if (this._attributes.length > 0) return this._attributes;
    const attrs = [];
    for (const [key, prop] of Object.entries(this._table.fields)) {
      const p = prop;
      if (p.kind === "value" || p.type === "lookupId" || p.type === "file") {
        attrs.push({ name: p.fromDataverseName ?? p.name, alias: key });
      }
    }
    return attrs;
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
   * fetchXml(contactDataverseTable)
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
   * fetchXml(contactDataverseTable).where(f => condition(f.status, "eq", 1))
   *
   * @example
   * // Raw filter string
   * fetchXml(contactDataverseTable).where(condition("statuscode", "eq", "1"))
   */
  where(filter) {
    let str;
    if (filter instanceof FilterExpr) {
      str = filter.toFetchXml();
    } else if (typeof filter === "function") {
      const result = filter(this._proxy);
      str = result instanceof FilterExpr ? result.toFetchXml() : result;
    } else {
      str = filter;
    }
    this._filters.push(str);
    return this;
  }
  /**
   * Adds a link-entity join to another table. The result type merges the
   * joined entity's selected fields.
   *
   * @example
   * fetchXml(contactDataverseTable)
   *   .select(f => ({ name: f.name }))
   *   .join("inner", accountDataverseTable, a => a.accountid, c => c.parentcustomerid,
   *     q => q.select(a => ({ accountName: a.name })))
   */
  join(linkType, table, from, to, subquery, intersect) {
    const nestedBuilder = new EntityQueryBuilder(table, this._linkAlias);
    subquery(nestedBuilder);
    const fromFieldName = table.fields[from].name;
    const toFieldName = this._table.fields[to].name;
    const autoAlias = `auto_link_${++this._linkAlias.value}`;
    const isIntersect = intersect ?? table.intersect === true;
    this._links.push({
      name: table.logicalName,
      from: fromFieldName,
      to: toFieldName,
      alias: autoAlias,
      linkType,
      builder: nestedBuilder,
      intersect: isIntersect
    });
    return this;
  }
  /**
   * Shorthand for `join("inner", ...)`. Adds an inner link-entity join.
   *
   * @example
   * fetchXml(contactDataverseTable)
   *   .select(f => ({ name: f.name }))
   *   .innerJoin(accountDataverseTable, a => a.accountid, c => c.parentcustomerid,
   *     q => q.select(a => ({ accountName: a.name })))
   */
  innerJoin(table, from, to, subquery, intersect) {
    return this.join("inner", table, from, to, subquery, intersect);
  }
  through(intersectTable, subquery) {
    let targetTable;
    if (intersectTable.table1 === this._table) {
      targetTable = intersectTable.table2;
    } else if (intersectTable.table2 === this._table) {
      targetTable = intersectTable.table1;
    } else {
      throw new Error(
        `Table "${this._table.name}" is not related to intersect table "${intersectTable.name}"`
      );
    }
    const targetBuilder = new EntityQueryBuilder(targetTable, this._linkAlias);
    subquery(targetBuilder);
    const pkName = this._table.getPrimaryKey().property.name;
    const targetPkName = targetTable.getPrimaryKey().property.name;
    const stubTable = { name: intersectTable.name, fields: {}, client: this._table.client };
    const intersectBuilder = new EntityQueryBuilder(stubTable, this._linkAlias);
    intersectBuilder._links.push({
      name: targetTable.logicalName,
      from: targetPkName,
      to: targetPkName,
      alias: `auto_link_${++this._linkAlias.value}`,
      linkType: "inner",
      builder: targetBuilder
    });
    this._links.push({
      name: intersectTable.name,
      from: pkName,
      to: pkName,
      alias: `auto_link_${++this._linkAlias.value}`,
      linkType: "inner",
      builder: intersectBuilder,
      intersect: true
    });
    return this;
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
  /** Marks the query as an aggregate (grouped) query. */
  aggregate() {
    this._isAggregate = true;
    return this;
  }
  orderby(...args) {
    if (typeof args[0] === "function") {
      const name = args[0](this._proxy);
      const dir = args[1] ?? "asc";
      this._orders.push({ attribute: name, descending: dir === "desc" });
    } else {
      const entityname = args[0];
      const attribute = args[1];
      const direction = args[2];
      this._orders.push({ attribute, entityname, descending: direction === "desc" });
    }
    return this;
  }
  groupby(selectFields, aggFields) {
    this._isAggregate = true;
    const keyProxy = {};
    for (const key of Object.keys(this._table.fields)) {
      keyProxy[key] = key;
    }
    const groupByKeys = selectFields(keyProxy);
    for (const key of groupByKeys) {
      const fieldDef = this._table.fields[key];
      if (fieldDef) {
        this._attributes.push({ name: fieldDef.name, alias: key, groupby: true });
      }
    }
    if (aggFields) {
      const aggs = aggFields(this._proxy);
      for (const [alias, agg] of Object.entries(aggs)) {
        if (agg.field) {
          this._attributes.push({
            name: agg.field,
            alias,
            aggregate: agg.operation
          });
        }
      }
    }
    return this;
  }
  /**
   * Returns the full FetchXML string.
   *
   * @example
   * const xml = fetchXml(contactDataverseTable)
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
    if (this._isAggregate) fetchAttrs.push(`aggregate="true"`);
    if (this._useRawOrderBy) fetchAttrs.push(`useraworderby="true"`);
    if (this._lateMaterialize) fetchAttrs.push(`latematerialize="true"`);
    if (this._aggregateLimit !== void 0) fetchAttrs.push(`aggregatelimit='${this._aggregateLimit}'`);
    if (this._datasource) fetchAttrs.push(`datasource='${this._datasource}'`);
    if (this._options) fetchAttrs.push(`options='${this._options}'`);
    lines.push(`<fetch ${fetchAttrs.join(" ")}>`);
    lines.push(`  <entity name="${this._table.logicalName}">`);
    for (const attr of this._getEffectiveAttributes()) {
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
      lines.push(...this._renderLinkEntity(link, "    "));
    }
    lines.push(`  </entity>`);
    lines.push(`</fetch>`);
    return lines.join("\n");
  }
  static _isFilterOnlyLinkType(linkType) {
    return linkType === "any" || linkType === "not any" || linkType === "all" || linkType === "not all" || linkType === "exists" || linkType === "in";
  }
  _renderLinkEntity(link, indent) {
    const lines = [];
    const linkAttrs = [
      `name="${link.name}"`,
      `from="${link.from}"`,
      `to="${link.to}"`,
      `alias="${link.alias}"`,
      `link-type="${link.linkType}"`
    ];
    if (link.intersect) linkAttrs.push(`intersect="true"`);
    lines.push(`${indent}<link-entity ${linkAttrs.join(" ")}>`);
    const childIndent = `${indent}  `;
    const filterOnly = EntityQueryBuilder._isFilterOnlyLinkType(link.linkType);
    if (link.builder._filters.length > 0) {
      lines.push(`${childIndent}<filter type="and">`);
      for (const c of link.builder._filters) {
        lines.push(`${childIndent}  ${c}`);
      }
      lines.push(`${childIndent}</filter>`);
    }
    if (!filterOnly) {
      for (const nestedAttr of link.builder._getEffectiveAttributes()) {
        const attrParts = [`name="${nestedAttr.name}"`, `alias="${nestedAttr.alias}"`];
        if (nestedAttr.aggregate) attrParts.push(`aggregate='${nestedAttr.aggregate}'`);
        if (nestedAttr.groupby) attrParts.push(`groupby='true'`);
        if (nestedAttr.dategrouping) attrParts.push(`dategrouping='${nestedAttr.dategrouping}'`);
        if (nestedAttr.distinct) attrParts.push(`distinct='true'`);
        if (nestedAttr.rowaggregate) attrParts.push(`rowaggregate='${nestedAttr.rowaggregate}'`);
        lines.push(`${childIndent}<attribute ${attrParts.join(" ")} />`);
      }
      for (const order of link.builder._orders) {
        const parts = [`attribute='${order.attribute}'`];
        if (order.descending) parts.push(`descending='true'`);
        lines.push(`${childIndent}<order ${parts.join(" ")} />`);
      }
    }
    for (const nestedLink of link.builder._links) {
      lines.push(...this._renderLinkEntity(nestedLink, childIndent));
    }
    lines.push(`${indent}</link-entity>`);
    return lines;
  }
  /**
   * Returns the URL-encoded query string for use in the Dataverse API.
   *
   * @example
   * fetchXml(contactDataverseTable).select(f => ({ name: f.name })).toString()
   * // "fetchXml=%3Cfetch%20version%3D%221.0%22..."
   */
  toString() {
    return `fetchXml=${encodeURIComponent(this.toXml())}`;
  }
  /**
   * Executes the FetchXML query against Dataverse and returns the parsed results.
   *
   * @example
   * const contacts = await fetchXml(contactDataverseTable)
   *   .select(f => ({ name: f.name, email: f.email }))
   *   .where(f => condition(f.status, "eq", 1))
   *   .execute();
   * // contacts: Array<{ name: string; email: string }>
   *
   * @example
   * // With rarely-used options
   * const contacts = await fetchXml(contactDataverseTable)
   *   .select(f => ({ name: f.name }))
   *   .execute({ useRawOrderBy: true, aggregateLimit: 5000 });
   */
  async execute(options) {
    if (options?.datasource) this._datasource = options.datasource;
    if (options?.lateMaterialize) this._lateMaterialize = true;
    if (options?.aggregateLimit !== void 0) this._aggregateLimit = options.aggregateLimit;
    if (options?.useRawOrderBy) this._useRawOrderBy = true;
    if (options?.options) this._options = options.options;
    const raw = await this._table.client.getRecords(this._table.entitySetName, this.toString());
    const aliasInfo = this._buildAliasInfo();
    if (aliasInfo.size > 0) {
      return raw.map((v) => {
        const result = {};
        for (const [alias, info] of aliasInfo) {
          if (info.name in v) {
            result[alias] = info.transform(v[info.name]);
          } else {
            result[alias] = info.getDefault();
          }
        }
        result[Etag] = v["@odata.etag"];
        return result;
      });
    }
    return raw.map((v) => {
      const r = this._table.transformValueFromDataverse(v);
      return r;
    });
  }
  _buildAliasInfo() {
    const map = /* @__PURE__ */ new Map();
    this._collectAliases(this, map);
    return map;
  }
  _collectAliases(builder, map) {
    for (const attr of builder._getEffectiveAttributes()) {
      const fields = builder._table.fields;
      const entry = Object.entries(fields).find(
        ([_, f]) => (f.fromDataverseName ?? f.name) === attr.name
      );
      if (entry) {
        const fieldDef = entry[1];
        const dataverseName = fieldDef.fromDataverseName ?? fieldDef.name;
        map.set(attr.alias, {
          transform: (val) => fieldDef.transformValueFromDataverse(val),
          getDefault: () => fieldDef.getDefault?.(),
          name: dataverseName
        });
      } else {
        map.set(attr.alias, {
          transform: (val) => val,
          getDefault: () => void 0,
          name: attr.name
        });
      }
    }
    for (const link of builder._links) {
      if (!EntityQueryBuilder._isFilterOnlyLinkType(link.linkType)) {
        this._collectAliases(link.builder, map);
      }
    }
  }
}
function condition(attribute, operator, value) {
  return `<condition attribute="${attribute}" operator="${operator}" value="${value}" />`;
}
function conditionCompare(attribute, operator, otherAttribute) {
  return `<condition attribute="${attribute}" operator="${operator}" valueof="${otherAttribute}" />`;
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

export { Above, AboveOrEqual, Aggregation, Between, BooleanField, CollectionIdsProperty, CollectionProperty, ContainsValues, DataverseClient, DataverseIntersectTable, DataverseTable, DateField, DateTimeField, DoesNotContainValues, EntityQueryBuilder, EqualBusinessId, EqualUserId, EqualUserLanguage, EqualUserOrUserHierarchy, EqualUserOrUserHierarchyAndTeams, EqualUserOrUserTeams, Etag, FileField, FilterExpr, FormattedField, ImageField, In, InFiscalPeriod, InFiscalPeriodAndYear, InFiscalYear, InOrAfterFiscalPeriodAndYear, InOrBeforeFiscalPeriodAndYear, Last7Days, LastFiscalPeriod, LastFiscalYear, LastMonth, LastWeek, LastXDays, LastXFiscalPeriods, LastXFiscalYears, LastXHours, LastXMonths, LastXWeeks, LastXYears, LastYear, ListField, LookupIdProperty, LookupProperty, Next7Days, NextFiscalPeriod, NextFiscalYear, NextMonth, NextWeek, NextXDays, NextXFiscalPeriods, NextXFiscalYears, NextXHours, NextXMonths, NextXWeeks, NextXYears, NextYear, NotBetween, NotEqualBusinessId, NotEqualUserId, NotIn, NotUnder, NullableDateField, NullableDateTimeField, NullableNumberField, NullableStringField, NumberField, ODataQuery, OlderThanXDays, OlderThanXHours, OlderThanXMinutes, OlderThanXMonths, OlderThanXWeeks, OlderThanXYears, On, OnOrAfter, OnOrBefore, OrderSpec, PrimaryKeyField, RetrieveAadUserRoles, RetrieveChoices, RetrieveTotalRecordCount, Schema, StringField, ThisFiscalPeriod, ThisFiscalYear, ThisMonth, ThisWeek, ThisYear, Today, Tomorrow, Under, UnderOrEqual, WhoAmI, Yesterday, all, and, any, asc, attachEtag, avg, base64ImageToURL, boolean, collection, collectionIds, compare, condition, conditionCompare, contains, count, date, datetime, desc, email, endsWith, eq, expand, fetchOdata, fetchXml, file, filterAnd, filterOr, formatted, ge, getEtag, getImageUrl, getName, gt, image, integer, isActive, isInactive, isNonEmptyString, isNotNull, isNull, isType, isTypeOrNull, keys, le, list, lookup, lookupId, lt, mapChoices, max, maxLength, maxValue, mergeRecords, min, minLength, minValue, ne, not, nullableDate, nullableDateTime, nullableNumber, nullableString, number, numeric, or, orderby, parseDateOnly, pattern, primaryKey, required, select, startsWith, string, sum, toBase64, toDateOnly, wrapString, xml };
