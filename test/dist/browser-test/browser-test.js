(function () {
  'use strict';

  const Etag = "$etag";
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
  class DataverseHttpError extends Error {
    constructor(message, status, statusText, body, response) {
      super(message);
      this.status = status;
      this.statusText = statusText;
      this.body = body;
      this.response = response;
      this.name = "DataverseHttpError";
    }
  }
  class DataverseClient {
    options;
    /** @param options Connection and authentication options. */
    constructor(options = {}) {
      const defaultUrl = typeof location !== "undefined" ? location.origin : void 0;
      const url = options.url ?? defaultUrl;
      if (!url) throw new Error("A Dataverse URL is required outside a browser");
      this.options = {
        ...options,
        url: url.replace(/\/+$/, "")
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
      const { raw, ...fetchOptions } = options;
      const url = /^https?:\/\//i.test(resource) ? resource : `${this.options.url}/api/data/v9.2/${resource.replace(/^\/+/, "")}`;
      const {
        headers,
        impersonateByAAId,
        impersonateByUserId,
        token,
        prefer,
        consistency,
        solutionUniqueName,
        suppressDuplicateDetection,
        bypassCustomPluginExecution
      } = this.options;
      const response = await fetch(url, {
        ...fetchOptions,
        headers: {
          ...raw ? {} : {
            "OData-MaxVersion": "4.0",
            "OData-Version": "4.0",
            Accept: "application/json",
            "Content-Type": "application/json; charset=utf-8"
          },
          "If-None-Match": "null",
          ...impersonateByUserId ? { MSCRMCallerID: impersonateByUserId } : {},
          ...impersonateByAAId ? { CallerObjectId: impersonateByAAId } : {},
          ...token ? { Authorization: `Bearer ${token}` } : {},
          ...prefer?.length ? { Prefer: this._resolvePrefer(prefer) } : {},
          ...consistency ? { Consistency: consistency } : {},
          ...solutionUniqueName ? { "MSCRM.SolutionUniqueName": solutionUniqueName } : {},
          ...suppressDuplicateDetection !== void 0 ? { "MSCRM.SuppressDuplicateDetection": String(suppressDuplicateDetection) } : {},
          ...bypassCustomPluginExecution !== void 0 ? { "MSCRM.BypassCustomPluginExecution": String(bypassCustomPluginExecution) } : {},
          ...headers,
          ...fetchOptions.headers
        }
      });
      if (raw) return response;
      if (response.status === 204) {
        const entityId = response.headers.get("OData-EntityId");
        if (entityId) return parenthesesRegEx.exec(entityId)?.[1];
        return;
      }
      if (response.status === 304) {
        return null;
      }
      const isJson = response.headers.get("Content-Type")?.includes("application/json");
      if (isJson) {
        const data = await response.json();
        if (data.error) {
          throw data.error;
        }
        if (!response.ok) {
          throw new DataverseHttpError(
            `${response.status} ${response.statusText}`,
            response.status,
            response.statusText,
            data,
            response
          );
        }
        return data;
      }
      if (!response.ok) {
        const body = await response.text();
        throw new DataverseHttpError(
          `${response.status} ${response.statusText}`,
          response.status,
          response.statusText,
          body,
          response
        );
      }
      return await response.text();
    }
    //
    // --- PRIVATE HELPER METHODS ---
    //
    _resolvePrefer(prefer) {
      return prefer.map((p) => {
        if (typeof p === "string") return p;
        if ("annotations" in p) {
          const v = Array.isArray(p.annotations) ? p.annotations.join(",") : p.annotations;
          return `odata.include-annotations="${v}"`;
        }
        if ("maxPageSize" in p) return `odata.maxpagesize=${p.maxPageSize}`;
        return "";
      }).filter(Boolean).join(",");
    }
    async *_iteratePages(resource, pageSize, signal) {
      const extraHeaders = {};
      if (pageSize) {
        const basePrefer = this._resolvePrefer(this.options.prefer ?? []);
        extraHeaders["Prefer"] = basePrefer ? `${basePrefer},odata.maxpagesize=${pageSize}` : `odata.maxpagesize=${pageSize}`;
      }
      let nextLink = resource;
      while (nextLink) {
        const result = await this.fetch(nextLink, {
          headers: extraHeaders,
          signal
        });
        yield result.value;
        nextLink = result["@odata.nextLink"];
      }
    }
    _resource(path, query = "") {
      if (!query) return path;
      return `${path}${query.startsWith("?") ? query : `?${query}`}`;
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
    async getRecord(entitySetName, id, options = {}) {
      try {
        const resource = this._resource(`${getName(entitySetName)}(${id})`, options.query);
        return await this.fetch(resource, {
          ...options.etag ? { headers: { "If-None-Match": options.etag } } : {},
          signal: options.signal
        });
      } catch (error) {
        if (error?.code === "0x80060891") return null;
        throw error;
      }
    }
    /**
     * Retrieves multiple records, automatically following `@odata.nextLink` pagination.
     *
     * @example
     * const accounts = await client.getRecords("accounts",
     *   "$select=name,revenue&$filter=revenue gt 10000")
     */
    async getRecords(entitySetName, options = {}) {
      const results = [];
      for await (const page of this.iteratePages(entitySetName, options)) {
        results.push(...page);
      }
      return results;
    }
    /**
     * Iterates over records one at a time, lazily following `@odata.nextLink` pagination.
     * Records within a page are yielded synchronously once the page arrives; only page
     * boundaries trigger HTTP requests. A `break` stops further requests.
     *
     * @param entitySetName The entity set to query (e.g. `"accounts"`).
     * @param query OData query string (e.g. `"$select=name&$top=10"`).
     * @param options Optional page-size control.
     *
     * @example
     * for await (const account of client.iterateRecords("accounts", "$select=name", { pageSize: 100 })) {
     *   console.log(account.name);
     * }
     */
    async *iterateRecords(entitySetName, options = {}) {
      for await (const page of this.iteratePages(entitySetName, options)) {
        yield* page;
      }
    }
    /**
     * Iterates over pages of records, lazily following `@odata.nextLink` pagination.
     * The next page is only fetched when the consumer requests it, so `break`
     * stops further requests. Prefer this over {@link iterateRecords} when you
     * want to iterate a page's array synchronously.
     *
     * @param entitySetName The entity set to query (e.g. `"accounts"`).
     * @param query OData query string (e.g. `"$select=name&$top=10"`).
     * @param options Optional page-size control.
     *
     * @example
     * for await (const page of client.iteratePages("accounts", "$select=name", { pageSize: 100 })) {
     *   for (const account of page) console.log(account.name);
     * }
     */
    async *iteratePages(entitySetName, options = {}) {
      yield* this._iteratePages(
        this._resource(getName(entitySetName), options.query),
        options.pageSize,
        options.signal
      );
    }
    async postRecord(entitySetName, value, options = {}) {
      const returnRepresentation = options.returnRepresentation !== false;
      const result = await this.fetch(this._resource(getName(entitySetName), options.query), {
        method: "POST",
        ...returnRepresentation ? { headers: { Prefer: "return=representation" } } : {},
        body: JSON.stringify(value),
        signal: options.signal
      });
      if (returnRepresentation) return result;
      if (typeof result !== "string" || !result) {
        throw new Error("Dataverse did not return a record ID");
      }
      return result;
    }
    /**
     * Updates an existing record (partial update via PATCH).
     *
     * @example
     * await client.patchRecord("accounts", "00000000-0000-0000-0000-000000000001",
     *   { name: "Updated Name", revenue: 75000 })
     */
    async patchRecord(entitySetName, id, value, options = {}) {
      const extraHeaders = { Prefer: "return=representation" };
      if (options.etag) extraHeaders["If-Match"] = options.etag;
      return this.fetch(this._resource(`${getName(entitySetName)}(${id})`, options.query), {
        method: "PATCH",
        headers: extraHeaders,
        body: JSON.stringify(value),
        signal: options.signal
      });
    }
    /**
     * Deletes a record by ID.
     *
     * @example
     * const deletedId = await client.deleteRecord("accounts",
     *   "00000000-0000-0000-0000-000000000001")
     */
    async deleteRecord(entitySetName, id, options = {}) {
      const request = { method: "DELETE", signal: options.signal };
      if (options.etag) request.headers = { "If-Match": options.etag };
      await this.fetch(`${getName(entitySetName)}(${id})`, request);
      return id;
    }
    /**
     * Updates a single property value via PUT.
     *
     * @example
     * await client.updatePropertyValue("accounts",
     *   "00000000-0000-0000-0000-000000000001", "name", "New Name")
     */
    async updatePropertyValue(entitySetName, id, propertyName, value, options = {}) {
      const request = {
        method: "PUT",
        body: JSON.stringify({ value }),
        signal: options.signal
      };
      if (options.etag) request.headers = { "If-Match": options.etag };
      await this.fetch(`${getName(entitySetName)}(${id})/${getName(propertyName)}`, request);
      return id;
    }
    /**
     * Deletes (nulls out) a single property value.
     *
     * @example
     * await client.deletePropertyValue("accounts",
     *   "00000000-0000-0000-0000-000000000001", "emailaddress1")
     */
    async deletePropertyValue(entitySetName, id, propertyName, options) {
      await this.fetch(`${getName(entitySetName)}(${id})/${getName(propertyName)}`, {
        method: "DELETE",
        ...options
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
    async getPropertyValue(entitySetName, id, propertyName, options) {
      return this.fetch(`${getName(entitySetName)}(${id})/${getName(propertyName)}`, options).then((r) => r.value);
    }
    /**
     * Retrieves a property's raw value (e.g. file content) via `/$value`.
     *
     * @example
     * const imageData = await client.getPropertyRawValue("accounts",
     *   "00000000-0000-0000-0000-000000000001", "entityimage")
     */
    async getPropertyRawValue(entitySetName, id, propertyName, options) {
      return this.fetch(`${getName(entitySetName)}(${id})/${getName(propertyName)}/$value`, { raw: true, ...options });
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
    async updateFileProperty(entitySetName, id, propertyName, filename, body, options) {
      return this.fetch(`${getName(entitySetName)}(${id})/${getName(propertyName)}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/octet-stream",
          "x-ms-file-name": filename
        },
        body,
        ...options
      });
    }
    // fetchBlob removed — use fetch(resource, { raw: true }).then(r => r.blob())
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
    async associateRecord(entitySetName, parentId, propertyName, childEntitySetName, childId, options) {
      await this.fetch(`${getName(entitySetName)}(${parentId})/${getName(propertyName)}/$ref`, {
        method: "PUT",
        body: JSON.stringify({
          "@odata.id": `${this.options.url}/api/data/v9.2/${getName(childEntitySetName)}(${childId})`
        }),
        ...options
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
    async dissociateRecord(entitySetName, parentId, propertyName, childId, options) {
      const resource = `${getName(entitySetName)}(${parentId})/${getName(propertyName)}${childId ? `(${childId})` : ""}/$ref`;
      await this.fetch(resource, { method: "DELETE", ...options });
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
    async getAssociatedRecords(entitySetName, id, navigationPropertyName, options = {}) {
      const records = [];
      for await (const page of this._iteratePages(
        this._resource(`${getName(entitySetName)}(${id})/${getName(navigationPropertyName)}`, options.query),
        options?.pageSize,
        options?.signal
      )) {
        records.push(...page);
      }
      return records;
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
    async getAssociatedRecord(entitySetName, id, navigationPropertyName, options = {}) {
      const resource = this._resource(`${getName(entitySetName)}(${id})/${getName(navigationPropertyName)}`, options.query);
      return this.fetch(resource, { signal: options.signal });
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
        { query: `$select=${getName(childPrimaryKeyName)}` }
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
     *   await client.postRecord("accounts", { name: "New" }, { returnRepresentation: false });
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

  async function WhoAmI(client) {
    return client.fetch(`WhoAmI()`).then((r) => ({
      BusinessUnitId: r.BusinessUnitId,
      UserId: r.UserId,
      OrganizationId: r.OrganizationId
    }));
  }

  //#region src/storages/globalConfig/globalConfig.ts
  const DEFAULT_CONFIG = {
  	lang: void 0,
  	message: void 0,
  	abortEarly: void 0,
  	abortPipeEarly: void 0
  };
  /**
  * Returns the global configuration.
  *
  * @param config The config to merge.
  *
  * @returns The configuration.
  */
  /* @__NO_SIDE_EFFECTS__ */
  function getGlobalConfig(config$1) {
  	return DEFAULT_CONFIG;
  }

  //#endregion
  //#region src/storages/globalMessage/globalMessage.ts
  let store$3;
  /**
  * Returns a global error message.
  *
  * @param lang The language of the message.
  *
  * @returns The error message.
  */
  /* @__NO_SIDE_EFFECTS__ */
  function getGlobalMessage(lang) {
  	return store$3?.get(lang);
  }

  //#endregion
  //#region src/storages/schemaMessage/schemaMessage.ts
  let store$2;
  /**
  * Returns a schema error message.
  *
  * @param lang The language of the message.
  *
  * @returns The error message.
  */
  /* @__NO_SIDE_EFFECTS__ */
  function getSchemaMessage(lang) {
  	return store$2?.get(lang);
  }

  //#endregion
  //#region src/storages/specificMessage/specificMessage.ts
  let store$1;
  /**
  * Returns a specific error message.
  *
  * @param reference The identifier reference.
  * @param lang The language of the message.
  *
  * @returns The error message.
  */
  /* @__NO_SIDE_EFFECTS__ */
  function getSpecificMessage(reference, lang) {
  	return store$1?.get(reference)?.get(lang);
  }

  //#endregion
  //#region src/utils/_stringify/_stringify.ts
  /**
  * Stringifies an unknown input to a literal or type string.
  *
  * @param input The unknown input.
  *
  * @returns A literal or type string.
  *
  * @internal
  */
  /* @__NO_SIDE_EFFECTS__ */
  function _stringify(input) {
  	const type = typeof input;
  	if (type === "string") return `"${input}"`;
  	if (type === "number" || type === "bigint" || type === "boolean") return `${input}`;
  	if (type === "object" || type === "function") return (input && Object.getPrototypeOf(input)?.constructor?.name) ?? "null";
  	return type;
  }

  //#endregion
  //#region src/utils/_addIssue/_addIssue.ts
  /**
  * Adds an issue to the dataset.
  *
  * @param context The issue context.
  * @param label The issue label.
  * @param dataset The input dataset.
  * @param config The configuration.
  * @param other The optional props.
  *
  * @internal
  */
  function _addIssue(context, label, dataset, config$1, other) {
  	const input = other && "input" in other ? other.input : dataset.value;
  	const expected = other?.expected ?? context.expects ?? null;
  	const received = other?.received ?? /* @__PURE__ */ _stringify(input);
  	const issue = {
  		kind: context.kind,
  		type: context.type,
  		input,
  		expected,
  		received,
  		message: `Invalid ${label}: ${expected ? `Expected ${expected} but r` : "R"}eceived ${received}`,
  		requirement: context.requirement,
  		path: other?.path,
  		issues: other?.issues,
  		lang: config$1.lang,
  		abortEarly: config$1.abortEarly,
  		abortPipeEarly: config$1.abortPipeEarly
  	};
  	const isSchema = context.kind === "schema";
  	const message$1 = other?.message ?? context.message ?? /* @__PURE__ */ getSpecificMessage(context.reference, issue.lang) ?? (isSchema ? /* @__PURE__ */ getSchemaMessage(issue.lang) : null) ?? config$1.message ?? /* @__PURE__ */ getGlobalMessage(issue.lang);
  	if (message$1 !== void 0) issue.message = typeof message$1 === "function" ? message$1(issue) : message$1;
  	if (isSchema) dataset.typed = false;
  	if (dataset.issues) dataset.issues.push(issue);
  	else dataset.issues = [issue];
  }

  //#endregion
  //#region src/utils/_getStandardProps/_getStandardProps.ts
  const _standardCache = /* @__PURE__ */ new WeakMap();
  /**
  * Returns the Standard Schema properties.
  *
  * @param context The schema context.
  *
  * @returns The Standard Schema properties.
  */
  /* @__NO_SIDE_EFFECTS__ */
  function _getStandardProps(context) {
  	let cached = _standardCache.get(context);
  	if (!cached) {
  		cached = {
  			version: 1,
  			vendor: "valibot",
  			validate(value$1) {
  				return context["~run"]({ value: value$1 }, /* @__PURE__ */ getGlobalConfig());
  			}
  		};
  		_standardCache.set(context, cached);
  	}
  	return cached;
  }
  /**
  * [UUID](https://en.wikipedia.org/wiki/Universally_unique_identifier) regex.
  */
  const UUID_REGEX = /^[\da-f]{8}(?:-[\da-f]{4}){3}-[\da-f]{12}$/iu;

  //#endregion
  //#region src/actions/minLength/minLength.ts
  /* @__NO_SIDE_EFFECTS__ */
  function minLength(requirement, message$1) {
  	return {
  		kind: "validation",
  		type: "min_length",
  		reference: minLength,
  		async: false,
  		expects: `>=${requirement}`,
  		requirement,
  		message: message$1,
  		"~run"(dataset, config$1) {
  			if (dataset.typed && dataset.value.length < this.requirement) _addIssue(this, "length", dataset, config$1, { received: `${dataset.value.length}` });
  			return dataset;
  		}
  	};
  }

  //#endregion
  //#region src/actions/uuid/uuid.ts
  /* @__NO_SIDE_EFFECTS__ */
  function uuid(message$1) {
  	return {
  		kind: "validation",
  		type: "uuid",
  		reference: uuid,
  		async: false,
  		expects: null,
  		requirement: UUID_REGEX,
  		message: message$1,
  		"~run"(dataset, config$1) {
  			if (dataset.typed && !this.requirement.test(dataset.value)) _addIssue(this, "UUID", dataset, config$1);
  			return dataset;
  		}
  	};
  }

  //#endregion
  //#region src/methods/getFallback/getFallback.ts
  /**
  * Returns the fallback value of the schema.
  *
  * @param schema The schema to get it from.
  * @param dataset The output dataset if available.
  * @param config The config if available.
  *
  * @returns The fallback value.
  */
  /* @__NO_SIDE_EFFECTS__ */
  function getFallback(schema, dataset, config$1) {
  	return typeof schema.fallback === "function" ? schema.fallback(dataset, config$1) : schema.fallback;
  }

  //#endregion
  //#region src/methods/getDefault/getDefault.ts
  /**
  * Returns the default value of the schema.
  *
  * @param schema The schema to get it from.
  * @param dataset The input dataset if available.
  * @param config The config if available.
  *
  * @returns The default value.
  */
  /* @__NO_SIDE_EFFECTS__ */
  function getDefault(schema, dataset, config$1) {
  	return typeof schema.default === "function" ? schema.default(dataset, config$1) : schema.default;
  }

  //#endregion
  //#region src/schemas/boolean/boolean.ts
  /* @__NO_SIDE_EFFECTS__ */
  function boolean$1(message$1) {
  	return {
  		kind: "schema",
  		type: "boolean",
  		reference: boolean$1,
  		expects: "boolean",
  		async: false,
  		message: message$1,
  		get "~standard"() {
  			return /* @__PURE__ */ _getStandardProps(this);
  		},
  		"~run"(dataset, config$1) {
  			if (typeof dataset.value === "boolean") dataset.typed = true;
  			else _addIssue(this, "type", dataset, config$1);
  			return dataset;
  		}
  	};
  }

  //#endregion
  //#region src/schemas/date/date.ts
  /* @__NO_SIDE_EFFECTS__ */
  function date$1(message$1) {
  	return {
  		kind: "schema",
  		type: "date",
  		reference: date$1,
  		expects: "Date",
  		async: false,
  		message: message$1,
  		get "~standard"() {
  			return /* @__PURE__ */ _getStandardProps(this);
  		},
  		"~run"(dataset, config$1) {
  			if (dataset.value instanceof Date) if (!isNaN(dataset.value)) dataset.typed = true;
  			else _addIssue(this, "type", dataset, config$1, { received: "\"Invalid Date\"" });
  			else _addIssue(this, "type", dataset, config$1);
  			return dataset;
  		}
  	};
  }

  //#endregion
  //#region src/schemas/instance/instance.ts
  /* @__NO_SIDE_EFFECTS__ */
  function instance(class_, message$1) {
  	return {
  		kind: "schema",
  		type: "instance",
  		reference: instance,
  		expects: class_.name,
  		async: false,
  		class: class_,
  		message: message$1,
  		get "~standard"() {
  			return /* @__PURE__ */ _getStandardProps(this);
  		},
  		"~run"(dataset, config$1) {
  			if (dataset.value instanceof this.class) dataset.typed = true;
  			else _addIssue(this, "type", dataset, config$1);
  			return dataset;
  		}
  	};
  }

  //#endregion
  //#region src/schemas/nullable/nullable.ts
  /* @__NO_SIDE_EFFECTS__ */
  function nullable(wrapped, default_) {
  	return {
  		kind: "schema",
  		type: "nullable",
  		reference: nullable,
  		expects: `(${wrapped.expects} | null)`,
  		async: false,
  		wrapped,
  		default: default_,
  		get "~standard"() {
  			return /* @__PURE__ */ _getStandardProps(this);
  		},
  		"~run"(dataset, config$1) {
  			if (dataset.value === null) {
  				if (this.default !== void 0) dataset.value = /* @__PURE__ */ getDefault(this, dataset, config$1);
  				if (dataset.value === null) {
  					dataset.typed = true;
  					return dataset;
  				}
  			}
  			return this.wrapped["~run"](dataset, config$1);
  		}
  	};
  }

  //#endregion
  //#region src/schemas/number/number.ts
  /* @__NO_SIDE_EFFECTS__ */
  function number$1(message$1) {
  	return {
  		kind: "schema",
  		type: "number",
  		reference: number$1,
  		expects: "number",
  		async: false,
  		message: message$1,
  		get "~standard"() {
  			return /* @__PURE__ */ _getStandardProps(this);
  		},
  		"~run"(dataset, config$1) {
  			if (typeof dataset.value === "number" && !isNaN(dataset.value)) dataset.typed = true;
  			else _addIssue(this, "type", dataset, config$1);
  			return dataset;
  		}
  	};
  }

  //#endregion
  //#region src/schemas/object/object.ts
  /* @__NO_SIDE_EFFECTS__ */
  function object(entries$1, message$1) {
  	return {
  		kind: "schema",
  		type: "object",
  		reference: object,
  		expects: "Object",
  		async: false,
  		entries: entries$1,
  		message: message$1,
  		get "~standard"() {
  			return /* @__PURE__ */ _getStandardProps(this);
  		},
  		"~run"(dataset, config$1) {
  			const input = dataset.value;
  			if (input && typeof input === "object") {
  				dataset.typed = true;
  				dataset.value = {};
  				for (const key in this.entries) {
  					const valueSchema = this.entries[key];
  					if (key in input || (valueSchema.type === "exact_optional" || valueSchema.type === "optional" || valueSchema.type === "nullish") && valueSchema.default !== void 0) {
  						const value$1 = key in input ? input[key] : /* @__PURE__ */ getDefault(valueSchema);
  						const valueDataset = valueSchema["~run"]({ value: value$1 }, config$1);
  						if (valueDataset.issues) {
  							const pathItem = {
  								type: "object",
  								origin: "value",
  								input,
  								key,
  								value: value$1
  							};
  							for (const issue of valueDataset.issues) {
  								if (issue.path) issue.path.unshift(pathItem);
  								else issue.path = [pathItem];
  								dataset.issues?.push(issue);
  							}
  							if (!dataset.issues) dataset.issues = valueDataset.issues;
  							if (config$1.abortEarly) {
  								dataset.typed = false;
  								break;
  							}
  						}
  						if (!valueDataset.typed) dataset.typed = false;
  						dataset.value[key] = valueDataset.value;
  					} else if (valueSchema.fallback !== void 0) dataset.value[key] = /* @__PURE__ */ getFallback(valueSchema);
  					else if (valueSchema.type !== "exact_optional" && valueSchema.type !== "optional" && valueSchema.type !== "nullish") {
  						_addIssue(this, "key", dataset, config$1, {
  							input: void 0,
  							expected: `"${key}"`,
  							path: [{
  								type: "object",
  								origin: "key",
  								input,
  								key,
  								value: input[key]
  							}]
  						});
  						if (config$1.abortEarly) break;
  					}
  				}
  			} else _addIssue(this, "type", dataset, config$1);
  			return dataset;
  		}
  	};
  }

  //#endregion
  //#region src/schemas/optional/optional.ts
  /* @__NO_SIDE_EFFECTS__ */
  function optional(wrapped, default_) {
  	return {
  		kind: "schema",
  		type: "optional",
  		reference: optional,
  		expects: `(${wrapped.expects} | undefined)`,
  		async: false,
  		wrapped,
  		default: default_,
  		get "~standard"() {
  			return /* @__PURE__ */ _getStandardProps(this);
  		},
  		"~run"(dataset, config$1) {
  			if (dataset.value === void 0) {
  				if (this.default !== void 0) dataset.value = /* @__PURE__ */ getDefault(this, dataset, config$1);
  				if (dataset.value === void 0) {
  					dataset.typed = true;
  					return dataset;
  				}
  			}
  			return this.wrapped["~run"](dataset, config$1);
  		}
  	};
  }

  //#endregion
  //#region src/schemas/string/string.ts
  /* @__NO_SIDE_EFFECTS__ */
  function string$1(message$1) {
  	return {
  		kind: "schema",
  		type: "string",
  		reference: string$1,
  		expects: "string",
  		async: false,
  		message: message$1,
  		get "~standard"() {
  			return /* @__PURE__ */ _getStandardProps(this);
  		},
  		"~run"(dataset, config$1) {
  			if (typeof dataset.value === "string") dataset.typed = true;
  			else _addIssue(this, "type", dataset, config$1);
  			return dataset;
  		}
  	};
  }

  //#endregion
  //#region src/methods/pipe/pipe.ts
  /* @__NO_SIDE_EFFECTS__ */
  function pipe(...pipe$1) {
  	return {
  		...pipe$1[0],
  		pipe: pipe$1,
  		get "~standard"() {
  			return /* @__PURE__ */ _getStandardProps(this);
  		},
  		"~run"(dataset, config$1) {
  			for (const item of pipe$1) if (item.kind !== "metadata") {
  				if (dataset.issues && (item.kind === "schema" || item.kind === "transformation")) {
  					dataset.typed = false;
  					break;
  				}
  				if (!dataset.issues || !config$1.abortEarly && !config$1.abortPipeEarly) dataset = item["~run"](dataset, config$1);
  			}
  			return dataset;
  		}
  	};
  }

  //#endregion
  //#region src/methods/safeParse/safeParse.ts
  /**
  * Parses an unknown input based on a schema.
  *
  * @param schema The schema to be used.
  * @param input The input to be parsed.
  * @param config The parse configuration.
  *
  * @returns The parse result.
  */
  /* @__NO_SIDE_EFFECTS__ */
  function safeParse(schema, input, config$1) {
  	const dataset = schema["~run"]({ value: input }, /* @__PURE__ */ getGlobalConfig());
  	return {
  		typed: dataset.typed,
  		success: !dataset.issues,
  		output: dataset.value,
  		issues: dataset.issues
  	};
  }

  class FieldRef {
    field;
    path;
    _path;
    constructor(field, path, pathSegments) {
      if (typeof field === "string") {
        const name = field;
        this.field = {
          name,
          fromDataverseName: name,
          toDataverseName: name,
          transformValueFromDataverse: (value) => value,
          transformValueToDataverse: (value) => value
        };
        this._path = path ?? name;
        this.path = pathSegments ?? [this.field];
      } else {
        this.field = field;
        this._path = path ?? field.fromDataverseName;
        this.path = pathSegments ?? [field];
      }
    }
    static fromPath(field, path, pathSegments) {
      return new FieldRef(field, path, pathSegments);
    }
    get dataverseName() {
      return this._path;
    }
    transformFromDataverse(value, ctx) {
      return this.field.transformValueFromDataverse(value, ctx);
    }
    transformToDataverse(value, ctx) {
      return this.field.transformValueToDataverse(value, ctx);
    }
    toString() {
      return this._path;
    }
  }

  function propertyName(property) {
    return property.fromDataverseName ?? property.name;
  }
  function fieldPathName(path) {
    return path.map(propertyName).join("/");
  }

  class GroupByExpr {
    field;
    fieldRef;
    path;
    constructor(field, fieldRef) {
      this.field = field;
      this.fieldRef = fieldRef;
      this.path = fieldRef?.path;
    }
  }
  class Aggregation {
    field;
    fieldRef;
    path;
    operation;
    constructor(operation, field, fieldRef) {
      this.operation = operation;
      this.field = field;
      this.fieldRef = fieldRef;
      this.path = fieldRef?.path;
    }
  }

  function filterInputNode(filter, proxy) {
    const value = typeof filter === "function" ? filter(proxy) : filter;
    return typeof value === "string" ? { type: "raw", value } : value.getNode();
  }
  function renderFilterInput(filter, proxy, dialect) {
    const value = typeof filter === "function" ? filter(proxy) : filter;
    if (typeof value === "string") return value;
    return dialect === "odata" ? value.toOdata() : value.toFetchXml();
  }

  function toODataPath(path) {
    return fieldPathName(path);
  }
  function toODataFilterNode(node) {
    switch (node.type) {
      case "comparison":
        return { ...node, field: toODataPath(node.field) };
      case "null":
        return { ...node, field: toODataPath(node.field) };
      case "contains":
      case "startsWith":
      case "endsWith":
        return { ...node, field: toODataPath(node.field) };
      case "compare":
        return { ...node, field: toODataPath(node.field), otherField: toODataPath(node.otherField) };
      case "lambda":
        return { ...node, field: toODataPath(node.field), condition: toODataFilterNode(node.condition) };
      case "fn":
        return { ...node, field: toODataPath(node.field) };
      case "raw":
        return node;
      case "and":
      case "or":
        return { ...node, conditions: node.conditions.map(toODataFilterNode) };
      case "not":
        return { ...node, condition: toODataFilterNode(node.condition) };
    }
  }
  function renderFilter(node, scope) {
    const field = (path) => `${scope ? `${scope}/` : ""}${path}`;
    switch (node.type) {
      case "comparison":
        return `(${field(node.field)} ${node.operator} ${wrapString(node.value)})`;
      case "null":
        return `${field(node.field)} ${node.positive ? "eq" : "ne"} null`;
      case "contains":
        return `contains(${field(node.field)},${wrapString(node.value)})`;
      case "startsWith":
        return `startswith(${field(node.field)},${wrapString(node.value)})`;
      case "endsWith":
        return `endswith(${field(node.field)},${wrapString(node.value)})`;
      case "compare":
        return `(${field(node.field)} ${node.operator} ${field(node.otherField)})`;
      case "lambda":
        return `${node.field}/${node.operator}(${node.alias}: ${renderFilter(node.condition, node.alias)})`;
      case "fn": {
        const propertyName = wrapString(field(node.field));
        const values = node.values.map(wrapString);
        if (values.length === 0) return `Microsoft.Dynamics.CRM.${node.fnName}(PropertyName=${propertyName})`;
        if (values.length === 1) return `Microsoft.Dynamics.CRM.${node.fnName}(PropertyName=${propertyName},PropertyValue=${values[0]})`;
        if (node.fnName === "Between" || node.fnName === "NotBetween") return `Microsoft.Dynamics.CRM.${node.fnName}(PropertyName=${propertyName},PropertyValues=[${values.join(",")}])`;
        if (["InFiscalPeriodAndYear", "InOrAfterFiscalPeriodAndYear", "InOrBeforeFiscalPeriodAndYear"].includes(node.fnName)) return `Microsoft.Dynamics.CRM.${node.fnName}(PropertyName=${propertyName},PropertyValue1=${values[0]},PropertyValue2=${values[1]})`;
        return `Microsoft.Dynamics.CRM.${node.fnName}(PropertyName=${propertyName},PropertyValues=[${values.join(",")}])`;
      }
      case "raw":
        return node.value;
      case "and":
        return node.conditions.length === 0 ? "" : `(${node.conditions.map((child) => renderFilter(child, scope)).join(" and ")})`;
      case "or":
        return node.conditions.length === 0 ? "" : `(${node.conditions.map((child) => renderFilter(child, scope)).join(" or ")})`;
      case "not":
        return `not(${renderFilter(node.condition, scope)})`;
    }
  }
  function renderFilters(filters) {
    if (filters.length === 0) return void 0;
    return `$filter=${filters.map((filter) => renderFilter(filter)).join(" and ")}`;
  }
  function renderOrderby(orderby) {
    if (orderby.length === 0) return void 0;
    return `$orderby=${orderby.map((order) => `${order.field} ${order.direction}`).join(",")}`;
  }
  function renderAggregateOrderby(orderby) {
    if (orderby.length === 0) return void 0;
    return `$orderby=${orderby.map((order) => `${order.field} ${order.direction}`).join(",")}`;
  }
  function serializeApply(ast) {
    if (ast.kind === "aggregate") {
      return `aggregate(${ast.expressions.map((expression) => expression.field ? `${expression.field} with ${expression.operation} as ${expression.alias}` : `$count as ${expression.alias}`).join(",")})`;
    }
    return `groupby((${ast.fields.join(",")})${ast.next ? `,${serializeApply(ast.next)}` : ""})`;
  }
  function renderExpands(expands) {
    if (expands.length === 0) return void 0;
    return `$expand=${expands.map((expand) => expand.query ? `${expand.navigation}(${serializeODataSelect(expand.query, ";")})` : expand.navigation).join(",")}`;
  }
  function serializeODataSelect(ast, separator = "&") {
    return [
      ast.select && ast.select.length > 0 ? `$select=${ast.select.join(",")}` : void 0,
      renderFilters(ast.filters ?? []),
      renderOrderby(ast.orderby ?? []),
      renderExpands(ast.expands ?? []),
      ast.top === void 0 ? void 0 : `$top=${ast.top}`
    ].filter((part) => part !== void 0).join(separator);
  }
  function serializeODataAggregate(ast) {
    return [
      renderFilters(ast.filters ?? []),
      ast.apply ? `$apply=${serializeApply(ast.apply)}` : void 0,
      renderAggregateOrderby(ast.orderby ?? []),
      ast.top === void 0 ? void 0 : `$top=${ast.top}`
    ].filter((part) => part !== void 0).join("&");
  }

  const proxyTableMap = /* @__PURE__ */ new WeakMap();
  const proxyPathMap = /* @__PURE__ */ new WeakMap();
  class ODataApplyQuery {
    _table;
    _filters = [];
    _apply;
    _orderby = [];
    _top;
    _aliasProxy = {};
    _aliasFields = {};
    constructor(table, apply, aliasProxy, initialFilters, aliasFields) {
      this._table = table;
      this._apply = apply;
      this._aliasProxy = aliasProxy;
      this._aliasFields = aliasFields ?? {};
      if (initialFilters) this._filters = [...initialFilters];
    }
    filter(filter) {
      this._filters.push(filterInputNode(filter, _buildProxyForTable(this._table)));
      return this;
    }
    orderby(nameOrSelector, direction = "asc") {
      if (typeof nameOrSelector === "function") {
        const result = nameOrSelector(this._aliasProxy);
        this._orderby.push({ name: typeof result === "string" ? result : result.toString(), dir: direction });
      } else {
        this._orderby.push({ name: nameOrSelector, dir: direction });
      }
      return this;
    }
    top(n) {
      this._top = n;
      return this;
    }
    _build() {
      return serializeODataAggregate(this.toAst());
    }
    toAst() {
      return {
        kind: "aggregate",
        filters: this._filters.map(toODataFilterNode),
        apply: this._apply,
        orderby: this._orderby.map((order) => ({ field: order.name, direction: order.dir })),
        top: this._top
      };
    }
    toString() {
      return this._build();
    }
    _transformRow(v) {
      const r = { ...v };
      for (const [alias, field] of Object.entries(this._aliasFields)) {
        if (field && alias in r) r[alias] = field.transformFromDataverse(r[alias]);
      }
      r[Etag] = v["@odata.etag"];
      delete r["@odata.etag"];
      return r;
    }
    async execute() {
      const results = [];
      for await (const page of this.iteratePages()) {
        results.push(...page);
      }
      return results;
    }
    async *iterate(options) {
      for await (const page of this.iteratePages(options)) {
        yield* page;
      }
    }
    async *iteratePages(options) {
      const qs = this.toString();
      const raw = this._table.client.iteratePages(this._table.entitySetName, { ...options, query: qs });
      for await (const page of raw) {
        yield page.map((v) => this._transformRow(v));
      }
    }
  }
  class ODataQuery {
    #table;
    #fields = [];
    #selectedKeys = [];
    #filters = [];
    #expands = [];
    #expandMeta = [];
    #orderby = [];
    #top;
    #proxy;
    #subQueryMode;
    constructor(table, subQueryMode) {
      this.#table = table;
      this.#proxy = _buildProxyForTable(table);
      this.#subQueryMode = subQueryMode;
    }
    get _table() {
      return this.#table;
    }
    get _proxy() {
      return this.#proxy;
    }
    get _expandMeta() {
      return this.#expandMeta;
    }
    select(...keys) {
      if (keys.length === 0) {
        this.#fields = [];
        this.#selectedKeys = [];
        for (const [key, prop] of Object.entries(this.#table.fields)) {
          if (prop.kind === "value" || prop.type === "lookupId" || prop.type === "file" || prop.type === "image") {
            this.#fields.push([prop]);
            this.#selectedKeys.push(key);
          }
        }
      } else {
        this.#fields = keys.map((k) => this.#proxy[k].path);
        this.#selectedKeys = keys;
      }
      return this;
    }
    expand(key, sub) {
      const prop = this.#table.fields[key];
      const isCollection = prop.type === "collection";
      if (this.#subQueryMode === "collection" && isCollection) {
        throw new Error("expand() within a collection expand only supports lookup navigation properties");
      }
      const child = new ODataQuery(prop.table, isCollection ? "collection" : "lookup");
      const result = sub?.(child);
      const q = result ?? child;
      this.#expands.push({ navigation: prop, key, query: q.toAst() });
      const childSelectedKeys = q._getSelectedKeys();
      const childExpandMeta = q._expandMeta;
      const subQueryProvided = !!sub;
      this.#expandMeta.push({
        key,
        dvName: prop.name,
        isCollection,
        selectedKeys: subQueryProvided ? childSelectedKeys.length > 0 ? childSelectedKeys : null : null,
        subExpands: subQueryProvided && childExpandMeta.length > 0 ? childExpandMeta : null
      });
      return this;
    }
    filter(filter) {
      this.#filters.push(filterInputNode(filter, this.#proxy));
      return this;
    }
    orderby(nameOrSelector, direction = "asc") {
      if (this.#subQueryMode === "lookup") throw new Error("orderby() is not supported in lookup expands");
      if (typeof nameOrSelector === "function") {
        const result = nameOrSelector(this.#proxy);
        this.#orderby.push({
          field: typeof result === "string" ? pathForName(this.#table, result) : result.path,
          direction
        });
      } else {
        this.#orderby.push({ field: pathForName(this.#table, nameOrSelector), direction });
      }
      return this;
    }
    top(n) {
      if (this.#subQueryMode === "lookup") throw new Error("top() is not supported in lookup expands");
      this.#top = n;
      return this;
    }
    apply(expr) {
      const result = expr(this.#proxy);
      const groupByFields = [];
      const aggregateExpressions = [];
      const aliasProxy = {};
      const aliasFields = {};
      for (const [alias, value] of Object.entries(result)) {
        aliasProxy[alias] = alias;
        if (value instanceof GroupByExpr) {
          if (value.path) groupByFields.push(toODataPath(value.path));
          aliasFields[alias] = value.fieldRef;
        } else if (value instanceof Aggregation) {
          aggregateExpressions.push({ field: value.path ? toODataPath(value.path) : void 0, operation: value.operation, alias });
          aliasFields[alias] = value.fieldRef;
        }
      }
      const aggregate = aggregateExpressions.length > 0 ? { kind: "aggregate", expressions: aggregateExpressions } : void 0;
      const apply = groupByFields.length > 0 ? { kind: "groupby", fields: groupByFields, next: aggregate } : aggregate;
      return new ODataApplyQuery(
        this.#table,
        apply,
        aliasProxy,
        this.#filters.length > 0 ? this.#filters : void 0,
        aliasFields
      );
    }
    _buildForExpand() {
      return serializeODataSelect(this.toAst(), ";");
    }
    toAst() {
      return {
        kind: "select",
        select: this.#fields.map(toODataPath),
        filters: this.#filters.map(toODataFilterNode),
        orderby: this.#orderby.map((order) => ({ field: toODataPath(order.field), direction: order.direction })),
        expands: this.#expands.map((expand) => ({ navigation: expand.navigation.name, query: expand.query })),
        top: this.#top
      };
    }
    toString() {
      return serializeODataSelect(this.toAst());
    }
    _getSelectedKeys() {
      return this.#selectedKeys;
    }
    _partialTransform(value) {
      const result = {};
      const recordId = value[this.#table.primaryKey.property.fromDataverseName] ?? value[this.#table.primaryKey.property.name];
      const ctx = { table: this.#table, client: this.#table.client, recordId: recordId ?? "" };
      for (const key of this.#selectedKeys) {
        const prop = this.#table.fields[key];
        result[key] = FieldRef.fromPath(prop, prop.fromDataverseName ?? prop.name).transformFromDataverse(value[prop.fromDataverseName], ctx);
      }
      for (const expand of this.#expandMeta) {
        if (value[expand.dvName] !== void 0) {
          result[expand.key] = _processExpand(value[expand.dvName], expand, this.#table);
        }
      }
      result[Etag] = value["@odata.etag"];
      return result;
    }
    _transformRow(value) {
      if (this.#selectedKeys.length > 0) {
        return this._partialTransform(value);
      }
      if (this.#expandMeta.some((e) => e.selectedKeys)) {
        return this._partialTransform(value);
      }
      return this.#table.transformValueFromDataverse(value);
    }
    async execute() {
      const results = [];
      for await (const page of this.iteratePages()) {
        results.push(...page);
      }
      return results;
    }
    async *iterate(options) {
      const qs = this.toString();
      if (!qs) {
        yield* this.#table.iterateRecords(void 0, options);
        return;
      }
      for await (const page of this.iteratePages(options)) {
        yield* page;
      }
    }
    async *iteratePages(options) {
      const qs = this.toString();
      if (!qs) {
        yield* this.#table.iteratePages(void 0, options);
        return;
      }
      for await (const page of this.#table.client.iteratePages(
        this.#table.entitySetName,
        { ...options, query: qs }
      )) {
        yield page.map((v) => this._transformRow(v));
      }
    }
  }
  class InitialQueryImpl {
    #table;
    constructor(table) {
      this.#table = table;
    }
    select(...keys) {
      const q = new ODataQuery(this.#table);
      if (keys.length === 0) {
        q.select();
      } else {
        q.select(...keys);
      }
      return q;
    }
    apply(expr) {
      return new ODataQuery(this.#table).apply(expr);
    }
  }
  function pathForName(table, path) {
    const segments = [];
    let current = table;
    for (const name of path.split("/")) {
      const entry = Object.values(current.fields).find((field) => (field.fromDataverseName ?? field.name) === name);
      if (!entry) throw new Error(`Unknown query field: ${path}`);
      segments.push(entry);
      if (entry.kind === "navigation") current = entry.table;
    }
    return segments;
  }
  function _processExpand(raw, expand, table) {
    if (raw === null || raw === void 0) return null;
    const navProp = table.fields[expand.key];
    const relatedTable = navProp.table;
    if (expand.isCollection) {
      const items = Array.from(raw ?? []);
      if (expand.selectedKeys) {
        return items.map((item) => _partialTransformItem(relatedTable, expand.selectedKeys, item, expand.subExpands));
      } else {
        return navProp.transformValueFromDataverse(raw);
      }
    } else {
      if (expand.selectedKeys) {
        return _partialTransformItem(relatedTable, expand.selectedKeys, raw, expand.subExpands);
      } else {
        return navProp.transformValueFromDataverse(raw);
      }
    }
  }
  function _partialTransformItem(table, selectedKeys, raw, subExpands) {
    const result = {};
    const recordId = raw[table.primaryKey.property.fromDataverseName] ?? raw[table.primaryKey.property.name];
    const ctx = { table, client: table.client, recordId: recordId ?? "" };
    for (const key of selectedKeys) {
      const prop = table.fields[key];
      if (prop) {
        result[key] = FieldRef.fromPath(prop, prop.fromDataverseName ?? prop.name).transformFromDataverse(raw[prop.fromDataverseName], ctx);
      }
    }
    if (subExpands) {
      for (const expand of subExpands) {
        if (raw[expand.dvName] !== void 0) {
          result[expand.key] = _processExpand(raw[expand.dvName], expand, table);
        }
      }
    }
    return result;
  }
  function _buildProxyForTable(table, prefix, prefixPath = []) {
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
              const sub = _buildProxyForTable(navProp.table, currentPrefix, [...prefixPath, navProp]);
              sub.toString = () => currentPrefix;
              Object.defineProperty(sub, "path", { value: [...prefixPath, navProp], enumerable: false });
              if (isCollection) proxyTableMap.set(sub, navProp.table);
              proxyPathMap.set(sub, [...prefixPath, navProp]);
              cached = sub;
            }
            return cached;
          },
          enumerable: true,
          configurable: true
        });
      } else {
        proxy[key] = FieldRef.fromPath(prop, prefix ? `${prefix}/${dataverseName}` : dataverseName, [...prefixPath, prop]);
      }
    }
    return proxy;
  }
  function fetchOdata(table) {
    return new InitialQueryImpl(table);
  }
  function expandAll(query, table, depth) {
    if (depth > 3) return;
    for (const [key, prop] of Object.entries(table.fields)) {
      if (prop.kind !== "navigation" || prop.type === "lookupId" || prop.type === "collectionIds") continue;
      query.expand(key, (sub) => {
        sub.select();
        expandAll(sub, prop.table, depth + 1);
        return sub;
      });
    }
  }
  function buildTableQueryAst(table, options) {
    const query = new ODataQuery(table);
    query.select();
    expandAll(query, table, 0);
    if (options?.filter) query.filter(options.filter);
    if (options?.top !== void 0) query.top(options.top);
    if (typeof options?.orderby === "string") {
      for (const value of options.orderby.split(",")) {
        const [field, direction = "asc"] = value.trim().split(/\s+/);
        if (field) query.orderby(field, direction);
      }
    } else {
      for (const [field, direction] of Object.entries(options?.orderby ?? {})) {
        const property = table.fields[field]?.fromDataverseName ?? table.fields[field]?.name ?? field;
        query.orderby(property, direction);
      }
    }
    return query.toAst();
  }

  class DataverseTable {
    client;
    fields;
    logicalName;
    entitySetName;
    name;
    kind = "table";
    type = "table";
    schema;
    primaryKey;
    /**
     * @param options Options including the DataverseClient, entity set name, logical name, and field definitions.
     */
    constructor(options) {
      this.client = options.client;
      this.entitySetName = options.entitySetName;
      this.logicalName = options.logicalName;
      this.name = options.entitySetName;
      this.fields = options.fields;
      this.schema = options.schema;
      if (options.primaryKey) {
        this.primaryKey = options.primaryKey;
      } else {
        const pk = Object.entries(this.fields).find((f) => f[1].type === "primaryKey");
        if (!pk) throw new Error("No Primary Key found in schema");
        this.primaryKey = { key: pk[0], property: pk[1] };
      }
    }
    getSchema() {
      if (this.schema) return this.schema;
      const shape = {};
      for (const [key, field] of Object.entries(this.fields)) {
        shape[key] = field.schema;
      }
      return object(shape);
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
    async getRecord(id, options) {
      return this.client.getRecord(this.entitySetName, id, {
        ...options,
        query: tableQuery(this)
      }).then((v2) => this.transformValueFromDataverse(v2));
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
    async getRecords(queryOptions, options) {
      return this.client.getRecords(this.entitySetName, {
        ...options,
        query: tableQuery(this, queryOptions)
      }).then((values) => values.map((v2) => this.transformValueFromDataverse(v2)));
    }
    /**
     * Iterates over records one at a time, lazily following `@odata.nextLink` pagination.
     * Each record is transformed like {@link getRecords}. Records within a page are
     * yielded synchronously once the page arrives; only page boundaries trigger HTTP
     * requests. A `break` stops further requests.
     *
     * @param queryOptions Optional query parameters (filter, orderby, top).
     * @param options Optional page-size control.
     *
     * @example
     * for await (const account of Account.iterateRecords({ filter: "statecode eq 0" }, { pageSize: 100 })) {
     *   console.log(account.name);
     * }
     */
    async *iterateRecords(queryOptions, options) {
      for await (const record of this.client.iterateRecords(
        this.entitySetName,
        {
          ...options,
          query: tableQuery(this, queryOptions)
        }
      )) {
        yield this.transformValueFromDataverse(record);
      }
    }
    /**
     * Iterates over pages of records, lazily following `@odata.nextLink` pagination.
     * Each yielded page is transformed like {@link getRecords}. The next page is
     * only fetched when the consumer requests it, so `break` stops further requests.
     * Prefer this over {@link iterateRecords} when you want to iterate a page's
     * array synchronously.
     *
     * @param queryOptions Optional query parameters (filter, orderby, top).
     * @param options Optional page-size control.
     *
     * @example
     * for await (const page of Account.iteratePages({ filter: "statecode eq 0" }, { pageSize: 100 })) {
     *   for (const account of page) console.log(account.name);
     * }
     */
    async *iteratePages(queryOptions, options) {
      for await (const page of this.client.iteratePages(
        this.entitySetName,
        {
          ...options,
          query: tableQuery(this, queryOptions)
        }
      )) {
        yield page.map((v2) => this.transformValueFromDataverse(v2));
      }
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
        return this.client.getPropertyValue(this.entitySetName, id, prop.name).then((v2) => prop.transformValueFromDataverse(v2));
      }
      if (prop.type === "collection" || prop.type === "collectionIds") {
        return this.client.getAssociatedRecords(
          this.entitySetName,
          id,
          prop.name,
          { query: tableQuery(prop.table, queryOptions) }
        ).then(
          (v2) => prop.transformValueFromDataverse(v2)
        );
      }
      if (prop.type === "lookup") {
        return this.client.getAssociatedRecord(
          this.entitySetName,
          id,
          prop.name,
          { query: tableQuery(prop.table, queryOptions) }
        ).then(
          (v2) => prop.transformValueFromDataverse(v2)
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
      const ctx = { table: this, client: this.client, recordId: id };
      if (prop.type === "lookupId") {
        const name = prop.navigationName;
        if (value === null) {
          await this.client.dissociateRecord(this.entitySetName, id, name);
        } else {
          await this.client.associateRecord(
            this.entitySetName,
            id,
            name,
            prop.table.entitySetName,
            value
          );
        }
      } else if (prop.kind === "navigation" && prop.afterSave) {
        await prop.afterSave(ctx, value);
      } else {
        let v2 = prop.transformValueToDataverse(value, ctx);
        if (v2 instanceof Promise) v2 = await v2;
        if (v2 !== SKIP) {
          await this.client.updatePropertyValue(
            this.entitySetName,
            id,
            this.fields[key].name,
            v2
          );
        }
      }
      return id;
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
      const pkName = this.primaryKey.property.name;
      const record = await this.client.postRecord(
        this.entitySetName,
        await this.transformValueToDataverse(value),
        { query: selectQuery(pkName) }
      );
      const guid = record?.[pkName];
      const ctx = { table: this, client: this.client, recordId: guid };
      await this._afterSave(ctx, value);
      return guid;
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
      const ctx = { table: this, client: this.client, recordId: id };
      await this.client.patchRecord(
        this.entitySetName,
        id,
        await this.transformValueToDataverse(value, ctx),
        { etag }
      );
      await this._afterSave(ctx, value);
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
      const pkName = this.primaryKey.property.name;
      const ctx = { table: this, client: this.client, recordId: "" };
      if (id) {
        ctx.recordId = id;
        const transformed = await this.transformValueToDataverse(value, ctx);
        await this.client.patchRecord(
          this.entitySetName,
          id,
          transformed,
          { query: selectQuery(pkName), etag }
        );
      } else {
        const record = await this.client.postRecord(
          this.entitySetName,
          await this.transformValueToDataverse(value),
          { query: selectQuery(pkName) }
        );
        id = record[pkName];
        ctx.recordId = id;
      }
      await this._afterSave(ctx, value);
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
      return this.client.deleteRecord(this.entitySetName, id, { etag });
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
        await Promise.all(records.map((r) => this.transformValueToDataverse(r)))
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
        await Promise.all(records.map((r) => this.transformValueToDataverse(r)))
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
     * Extracts the primary key GUID from a record object, or `undefined` if not present.
     *
     * @example
     * const account = await Account.getRecord("some-guid");
     * const pk = Account.getPrimaryId(account); // GUID | undefined
     */
    getPrimaryId(value) {
      return value[this.primaryKey.key];
    }
    transformValueFromDataverse(value) {
      if (value === null) return null;
      const result = {};
      const pk = this.primaryKey;
      const recordId = value[pk.property.fromDataverseName];
      const ctx = recordId ? { table: this, client: this.client, recordId } : void 0;
      for (const [key, property] of Object.entries(this.fields)) {
        const raw = value[property.fromDataverseName];
        result[key] = property.transformValueFromDataverse(raw, ctx);
      }
      result[Etag] = value["@odata.etag"];
      return result;
    }
    async transformValueToDataverse(value, ctx) {
      if (value === null) return null;
      const result = {};
      for (const [key, property] of Object.entries(this.fields)) {
        if (property.getReadOnly() || !(key in value) || value[key] === void 0) continue;
        let v2 = property.transformValueToDataverse(
          value[key],
          ctx
        );
        if (v2 instanceof Promise) v2 = await v2;
        if (v2 !== SKIP) result[property.toDataverseName] = v2;
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
        Object.entries(this.fields).filter((v2) => keys.includes(v2[0]))
      );
      return new DataverseTable({ client: this.client, entitySetName: this.entitySetName, logicalName: this.logicalName, fields: properties, primaryKey: this.primaryKey });
    }
    /**
     * Creates a new `DataverseTable` with the specified properties excluded.
     *
     * @example
     * const WithoutSensitive = Person.omitProperties("ssn");
     */
    omitProperties(...keys) {
      const properties = Object.fromEntries(
        Object.entries(this.fields).filter((v2) => !keys.includes(v2[0]))
      );
      return new DataverseTable({ client: this.client, entitySetName: this.entitySetName, logicalName: this.logicalName, fields: properties, primaryKey: this.primaryKey });
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
      return new DataverseTable({ client: this.client, entitySetName: this.entitySetName, logicalName: this.logicalName, primaryKey: this.primaryKey, fields: {
        ...this.fields,
        ...properties
      } });
    }
    async deleteFile(id, fieldName) {
      const field = this.fields[fieldName];
      if (!field || field.type !== "file") throw new Error(`"${fieldName}" is not a file column`);
      await this.client.deletePropertyValue(this.entitySetName, id, field.name);
    }
    async downloadImage(id, fieldName) {
      const field = this.fields[fieldName];
      if (!field || field.type !== "image") throw new Error(`"${fieldName}" is not an image column`);
      const response = await this.client.fetch(`${this.entitySetName}(${id})/${field.name}/$value`, { raw: true });
      if (!response.ok) throw new Error(response.status + "-" + response.statusText);
      return response.blob();
    }
    async deleteImage(id, fieldName) {
      const field = this.fields[fieldName];
      if (!field || field.type !== "image") throw new Error(`"${fieldName}" is not an image column`);
      await this.client.deletePropertyValue(this.entitySetName, id, field.name);
    }
    async _afterSave(ctx, value) {
      const promises = [];
      for (const [key, property] of Object.entries(this.fields)) {
        if (key in value && value[key] !== void 0 && property.afterSave) {
          promises.push(property.afterSave(ctx, value[key]));
        }
      }
      await Promise.all(promises);
    }
    /** Use for type inference: `Infer<typeof Account>` resolves to the record type. */
    T;
  }
  function tableQuery(table, options) {
    return serializeODataSelect(buildTableQueryAst(table, options));
  }
  function selectQuery(field) {
    return serializeODataSelect({
      select: [field]
    });
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

  const DATE_SCHEMA = date$1();
  const NON_EMPTY_STRING_SCHEMA = pipe(string$1(), minLength(1));
  function isValidDate(value) {
    return safeParse(DATE_SCHEMA, value).success;
  }
  function parseValidDateOnly(value) {
    if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}/.test(value)) throw new Error(`Invalid date-only value: ${value}`);
    const text = value;
    const result = parseDateOnly(text);
    const [year, month, day] = text.slice(0, 10).split("-").map(Number);
    if (!isValidDate(result) || result.getFullYear() !== year || result.getMonth() !== month - 1 || result.getDate() !== day) {
      throw new Error(`Invalid date-only value: ${text}`);
    }
    return result;
  }
  const SKIP = Symbol("skip");
  class FieldBase {
    name;
    fromDataverseName;
    toDataverseName;
    kind;
    type;
    schema;
    #default;
    #readOnly;
    constructor(name, defaults, options) {
      this.name = name;
      this.fromDataverseName = name;
      this.toDataverseName = name;
      this.#default = options?.default ?? defaults.defaultValue;
      this.#readOnly = options?.readonly ?? false;
      this.schema = options?.schema ?? defaults.schema;
    }
    getDefault() {
      return this.#default;
    }
    getReadOnly() {
      return this.#readOnly;
    }
    transformValueFromDataverse(value, ctx) {
      return value;
    }
    transformValueToDataverse(value, ctx) {
      return value;
    }
  }
  class BooleanField extends FieldBase {
    kind = "value";
    type = "boolean";
    constructor(name, options) {
      super(name, { defaultValue: false, schema: boolean$1() }, options);
    }
    transformValueFromDataverse(value) {
      return value ?? false;
    }
  }
  class NumberField extends FieldBase {
    kind = "value";
    type = "number";
    constructor(name, options) {
      super(name, { defaultValue: 0, schema: number$1() }, options);
    }
    transformValueFromDataverse(value) {
      return value ?? 0;
    }
  }
  class StringField extends FieldBase {
    kind = "value";
    type = "string";
    constructor(name, options) {
      super(name, { defaultValue: "", schema: string$1() }, options);
    }
    transformValueFromDataverse(value) {
      return value ?? "";
    }
  }
  class PrimaryKeyField extends FieldBase {
    kind = "value";
    type = "primaryKey";
    constructor(name, options) {
      super(name, {
        defaultValue: "",
        schema: pipe(string$1(), uuid())
      }, options);
    }
    getDefault() {
      return super.getDefault() || crypto.randomUUID();
    }
  }
  class DateTimeField extends FieldBase {
    kind = "value";
    type = "date";
    constructor(name, options) {
      super(name, {
        defaultValue: /* @__PURE__ */ new Date(),
        schema: instance(Date)
      }, options);
    }
    getDefault() {
      return /* @__PURE__ */ new Date();
    }
    transformValueFromDataverse(value) {
      if (value == null) return /* @__PURE__ */ new Date();
      const result = new Date(value);
      if (!isValidDate(result)) throw new Error(`Invalid datetime value: ${value}`);
      return result;
    }
  }
  class DateField extends FieldBase {
    kind = "value";
    type = "dateOnly";
    constructor(name, options) {
      super(name, {
        defaultValue: parseDateOnly((/* @__PURE__ */ new Date()).toISOString()),
        schema: instance(Date)
      }, options);
    }
    transformValueFromDataverse(value) {
      if (value == null) return parseDateOnly((/* @__PURE__ */ new Date()).toISOString());
      return parseValidDateOnly(value);
    }
    transformValueToDataverse(value) {
      if (!(value instanceof Date) || !isValidDate(value)) throw new Error("Invalid date value");
      return toDateOnly(value);
    }
  }
  class ImageField extends FieldBase {
    kind = "value";
    type = "image";
    constructor(name, options) {
      super(name, {
        defaultValue: null,
        schema: nullable(object({
          url: optional(string$1()),
          fullSizeUrl: optional(string$1()),
          data: optional(nullable(instance(Blob)))
        }))
      }, options);
    }
    transformValueFromDataverse(value, ctx) {
      if (value == null) return null;
      const b64 = String(value);
      const mimeType = b64.startsWith("/9j/") ? "image/jpeg" : b64.startsWith("iVB") ? "image/png" : b64.startsWith("R0lG") ? "image/gif" : "application/octet-stream";
      const url = `data:${mimeType};base64,${b64}`;
      if (!ctx) return { url };
      const fullSizeUrl = ctx.client.getImageFullSizeURL(ctx.table.entitySetName, ctx.recordId, this.name);
      return { url, fullSizeUrl };
    }
    //When using conditional operations (If-Match: Etag) image columns are not allowed even though they are allowed normally. Workaround is to update property after save
    async transformValueToDataverse(value) {
      return SKIP;
    }
    async afterSave(ctx, value) {
      if (value?.data === null) {
        await ctx.client.deletePropertyValue(ctx.table.entitySetName, ctx.recordId, this.name);
      } else if (value?.data instanceof Blob) {
        await ctx.client.updateFileProperty(ctx.table.entitySetName, ctx.recordId, this.name, "image.png", value.data);
      }
    }
  }
  class FileField extends FieldBase {
    type = "file";
    kind = "file";
    constructor(name, options) {
      super(name, {
        defaultValue: null,
        schema: nullable(object({
          name: string$1(),
          url: optional(string$1()),
          data: optional(nullable(instance(Blob)))
        }))
      }, { ...options, readonly: true });
      this.fromDataverseName = `${name}_name`;
    }
    transformValueFromDataverse(value, ctx) {
      if (value == null) return null;
      if (!ctx) return { name: value };
      return {
        name: value,
        url: ctx.client.getPropertyRawValueURL(ctx.table.entitySetName, ctx.recordId, this.name)
      };
    }
    transformValueToDataverse() {
      return SKIP;
    }
    async afterSave(ctx, value) {
      if (value?.data instanceof Blob) {
        const fileName = value.name ?? this.getDefault()?.name;
        if (fileName) {
          await ctx.client.updateFileProperty(ctx.table.entitySetName, ctx.recordId, this.name, fileName, value.data);
        }
      } else if (value?.data === null) {
        await ctx.client.deletePropertyValue(ctx.table.entitySetName, ctx.recordId, this.name);
      }
    }
  }
  function boolean(name, options) {
    return new BooleanField(name, options);
  }
  function number(name, options) {
    return new NumberField(name, options);
  }
  function string(name, options) {
    return new StringField(name, options);
  }
  function primaryKey(name, options) {
    return new PrimaryKeyField(name, options);
  }
  function datetime(name, options) {
    return new DateTimeField(name, options);
  }
  function date(name, options) {
    return new DateField(name, options);
  }
  function image(name, options) {
    return new ImageField(name, options);
  }
  function file(name, options) {
    return new FileField(name, options);
  }
  class LookupIdProperty extends FieldBase {
    kind = "navigation";
    type = "lookupId";
    navigationName;
    #getTable;
    constructor(name, getTable, options) {
      super(name, {
        defaultValue: null,
        schema: nullable(NON_EMPTY_STRING_SCHEMA)
      }, options);
      this.navigationName = name;
      this.#getTable = getTable;
      this.fromDataverseName = `_${name.toLowerCase()}_value`;
      this.toDataverseName = `${this.name}@odata.bind`;
    }
    #table;
    get table() {
      if (!this.#table) {
        const table = this.#getTable();
        const { property } = table.primaryKey;
        this.#table = new DataverseTable({ client: table.client, entitySetName: table.name, logicalName: table.name, fields: { id: property } });
      }
      return this.#table;
    }
    transformValueToDataverse(value) {
      if (value === null) return null;
      if (typeof value !== "string" || value.length === 0) {
        throw new Error("Lookup IDs must be non-empty strings");
      }
      return `${this.table.name}(${value})`;
    }
  }
  function lookupId(name, getTable) {
    return new LookupIdProperty(name, getTable);
  }

  function buildFlatFieldProxy(table) {
    const proxy = {};
    for (const [key, property] of Object.entries(table.fields)) {
      proxy[key] = new FieldRef(property);
    }
    return proxy;
  }

  function fetchAttributeAst(attribute) {
    return { ...attribute };
  }
  function fetchOrderAst(order) {
    return { ...order };
  }
  class FilterCollector {
    _filters = [];
    _proxy;
    constructor(table) {
      this._proxy = this._buildProxy(table);
    }
    _buildProxy(table) {
      return buildFlatFieldProxy(table);
    }
    filter(filter) {
      this._filters.push(renderFilterInput(filter, this._proxy, "fetchXml"));
      return this;
    }
  }
  class FetchXmlAggregateQuery {
    _linkAlias;
    _table;
    _attributes = [];
    _links = [];
    _filters = [];
    _aliasProxy = {};
    _proxy;
    _top;
    _useRawOrderBy = false;
    _lateMaterialize = false;
    _aggregateLimit;
    _orders = [];
    _datasource;
    _options;
    constructor(table, initialAttributes, _linkAlias, initialFilters) {
      this._table = table;
      this._linkAlias = _linkAlias ?? { value: 0 };
      this._proxy = this._buildProxy();
      if (initialAttributes) this._attributes = initialAttributes;
      if (initialFilters) this._filters = [...initialFilters];
      for (const attr of initialAttributes ?? []) {
        this._aliasProxy[attr.alias] = attr.alias;
      }
    }
    _buildProxy() {
      return buildFlatFieldProxy(this._table);
    }
    _getEffectiveAttributes() {
      return this._attributes;
    }
    filter(filter) {
      this._filters.push(renderFilterInput(filter, this._proxy, "fetchXml"));
      return this;
    }
    join(linkType, tableOrIntersect, fromOrSubquery, to, subquery, intersect) {
      if (tableOrIntersect instanceof DataverseIntersectTable) {
        const intersectTable = tableOrIntersect;
        const subqueryFn = fromOrSubquery;
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
        subqueryFn(targetBuilder);
        const pkName = this._table.primaryKey.property.name;
        const targetPkName = targetTable.primaryKey.property.name;
        const stubTable = { name: intersectTable.name, fields: {}, client: this._table.client };
        const intersectBuilder = new EntityQueryBuilder(stubTable, this._linkAlias);
        intersectBuilder._links.push({
          name: targetTable.logicalName,
          from: targetPkName,
          to: targetPkName,
          alias: `auto_link_${++this._linkAlias.value}`,
          linkType,
          builder: targetBuilder
        });
        const intersectAlias = `auto_link_${++this._linkAlias.value}`;
        this._links.push({
          name: intersectTable.name,
          from: pkName,
          to: pkName,
          alias: intersectAlias,
          linkType,
          builder: intersectBuilder,
          intersect: true
        });
        return this;
      }
      const table = tableOrIntersect;
      const from = fromOrSubquery;
      const nested = new EntityQueryBuilder(table, this._linkAlias);
      subquery(nested);
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
        builder: nested,
        intersect: isIntersect
      });
      return this;
    }
    top(n) {
      this._top = n;
      return this;
    }
    orderby(...args) {
      if (typeof args[0] === "function") {
        const result = args[0](this._aliasProxy);
        const name = typeof result === "string" ? result : result.toString();
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
    toAst() {
      return {
        kind: "xml-aggregate",
        entity: this._table.logicalName,
        version: "1.0",
        mapping: "logical",
        attributes: this._attributes.map(fetchAttributeAst),
        filters: [...this._filters],
        orders: this._orders.map(fetchOrderAst),
        links: this._links.map((link) => {
          const child = link.builder instanceof FilterCollector ? void 0 : link.builder.toAst();
          return {
            name: link.name,
            from: link.from,
            to: link.to,
            alias: link.alias,
            linkType: link.linkType,
            intersect: link.intersect,
            attributes: child?.attributes ?? [],
            filters: link.builder instanceof FilterCollector ? [...link.builder._filters] : child?.filters ?? [],
            orders: child?.orders ?? [],
            links: child?.links ?? []
          };
        }),
        top: this._top,
        aggregateLimit: this._aggregateLimit,
        datasource: this._datasource,
        options: this._options,
        lateMaterialize: this._lateMaterialize,
        useRawOrderBy: this._useRawOrderBy
      };
    }
    toXml() {
      const lines = [];
      const fetchAttrs = [`version="1.0"`, `mapping="logical"`];
      if (this._top !== void 0) fetchAttrs.push(`top='${this._top}'`);
      fetchAttrs.push(`aggregate="true"`);
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
    toString() {
      return `fetchXml=${encodeURIComponent(this.toXml())}`;
    }
    _applyExecuteOptions(options) {
      if (options?.datasource) this._datasource = options.datasource;
      if (options?.lateMaterialize) this._lateMaterialize = true;
      if (options?.aggregateLimit !== void 0) this._aggregateLimit = options.aggregateLimit;
      if (options?.useRawOrderBy) this._useRawOrderBy = true;
      if (options?.options) this._options = options.options;
    }
    _transformRow(v) {
      const aliasInfo = this._buildAliasInfo();
      if (aliasInfo.size > 0) {
        const result = {};
        const recordId = v[this._table.primaryKey.property.fromDataverseName] ?? v[this._table.primaryKey.property.name] ?? "";
        const ctx = { table: this._table, client: this._table.client, recordId };
        for (const [alias, info] of aliasInfo) {
          if (info.name in v) {
            result[alias] = info.field ? info.field.transformFromDataverse(v[info.name], ctx) : v[info.name];
          } else {
            result[alias] = info.getDefault();
          }
        }
        result[Etag] = v["@odata.etag"];
        return result;
      }
      return this._table.transformValueFromDataverse(v);
    }
    async execute(options) {
      this._applyExecuteOptions(options);
      const results = [];
      for await (const page of this.iteratePages(options)) {
        results.push(...page);
      }
      return results;
    }
    async *iterate(options) {
      this._applyExecuteOptions(options);
      for await (const page of this.iteratePages(options)) {
        yield* page;
      }
    }
    async *iteratePages(options) {
      this._applyExecuteOptions(options);
      for await (const page of this._table.client.iteratePages(
        this._table.entitySetName,
        { ...options, query: this.toString() }
      )) {
        yield page.map((v) => this._transformRow(v));
      }
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
            field: FieldRef.fromPath(fieldDef, dataverseName),
            getDefault: () => fieldDef.getDefault?.(),
            name: dataverseName
          });
        } else {
          map.set(attr.alias, {
            field: void 0,
            getDefault: () => void 0,
            name: attr.name
          });
        }
      }
      for (const link of builder._links) {
        if (!(link.builder instanceof FilterCollector)) {
          if (!EntityQueryBuilder._isFilterOnlyLinkType(link.linkType)) {
            const eb = link.builder;
            this._collectAliasesFromBuilder(eb, map);
          }
        }
      }
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
      const filterOnly = link.builder instanceof FilterCollector || EntityQueryBuilder._isFilterOnlyLinkType(link.linkType);
      const builderFilters = link.builder._filters ?? [];
      if (builderFilters.length > 0) {
        lines.push(`${childIndent}<filter type="and">`);
        for (const c of builderFilters) {
          lines.push(`${childIndent}  ${c}`);
        }
        lines.push(`${childIndent}</filter>`);
      }
      if (!filterOnly) {
        const eb = link.builder;
        for (const nestedAttr of eb._getEffectiveAttributes()) {
          const attrParts = [`name="${nestedAttr.name}"`, `alias="${nestedAttr.alias}"`];
          if (nestedAttr.aggregate) attrParts.push(`aggregate='${nestedAttr.aggregate}'`);
          if (nestedAttr.groupby) attrParts.push(`groupby='true'`);
          if (nestedAttr.dategrouping) attrParts.push(`dategrouping='${nestedAttr.dategrouping}'`);
          if (nestedAttr.distinct) attrParts.push(`distinct='true'`);
          if (nestedAttr.rowaggregate) attrParts.push(`rowaggregate='${nestedAttr.rowaggregate}'`);
          lines.push(`${childIndent}<attribute ${attrParts.join(" ")} />`);
        }
        for (const order of eb._orders) {
          const parts = [`attribute='${order.attribute}'`];
          if (order.descending) parts.push(`descending='true'`);
          lines.push(`${childIndent}<order ${parts.join(" ")} />`);
        }
      }
      if (!(link.builder instanceof FilterCollector)) {
        const eb = link.builder;
        for (const nestedLink of eb._links) {
          lines.push(...this._renderLinkEntity(nestedLink, childIndent));
        }
      }
      lines.push(`${indent}</link-entity>`);
      return lines;
    }
    _collectAliasesFromBuilder(builder, map) {
      for (const attr of builder._getEffectiveAttributes()) {
        const fields = builder._table.fields;
        const entry = Object.entries(fields).find(
          ([_, f]) => (f.fromDataverseName ?? f.name) === attr.name
        );
        if (entry) {
          const fieldDef = entry[1];
          const dataverseName = fieldDef.fromDataverseName ?? fieldDef.name;
          map.set(attr.alias, {
            field: FieldRef.fromPath(fieldDef, dataverseName),
            getDefault: () => fieldDef.getDefault?.(),
            name: dataverseName
          });
        } else {
          map.set(attr.alias, {
            field: void 0,
            getDefault: () => void 0,
            name: attr.name
          });
        }
      }
      for (const link of builder._links) {
        if (!EntityQueryBuilder._isFilterOnlyLinkType(link.linkType)) {
          this._collectAliasesFromBuilder(link.builder, map);
        }
      }
    }
  }
  class EntityQueryBuilder {
    _linkAlias;
    _table;
    _attributes = [];
    _links = [];
    _orders = [];
    _filters = [];
    _isDistinct = false;
    _proxy;
    _top;
    _isAggregate = false;
    _useRawOrderBy = false;
    _lateMaterialize = false;
    _aggregateLimit;
    _datasource;
    _options;
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
          attrs.push({ name: p.name, alias: key });
        }
      }
      return attrs;
    }
    _buildProxy() {
      return buildFlatFieldProxy(this._table);
    }
    select(selector) {
      if (this._isAggregate) throw new Error("select() is not supported after apply()");
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
    apply(expr) {
      const result = expr(this._proxy);
      const initialAttributes = [];
      for (const [alias, value] of Object.entries(result)) {
        if (value instanceof GroupByExpr) {
          initialAttributes.push({ name: value.field, alias, groupby: true });
        } else if (value instanceof Aggregation) {
          const fieldName = value.field ? value.field.toString() : this._table.primaryKey.property.name;
          initialAttributes.push({ name: fieldName, alias, aggregate: value.operation });
        }
      }
      this._attributes = initialAttributes;
      return this;
    }
    _toAggregateQuery() {
      const q = new FetchXmlAggregateQuery(
        this._table,
        this._attributes,
        this._linkAlias,
        [...this._filters]
      );
      if (this._datasource) q["_datasource"] = this._datasource;
      if (this._options) q["_options"] = this._options;
      return q;
    }
    filter(filter) {
      this._filters.push(renderFilterInput(filter, this._proxy, "fetchXml"));
      return this;
    }
    join(linkType, tableOrIntersect, fromOrSubquery, to, subquery, intersect) {
      if (tableOrIntersect instanceof DataverseIntersectTable) {
        const intersectTable = tableOrIntersect;
        const subqueryFn = fromOrSubquery;
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
        subqueryFn(targetBuilder);
        const pkName = this._table.primaryKey.property.name;
        const targetPkName = targetTable.primaryKey.property.name;
        const stubTable = { name: intersectTable.name, fields: {}, client: this._table.client };
        const intersectBuilder = new EntityQueryBuilder(stubTable, this._linkAlias);
        intersectBuilder._links.push({
          name: targetTable.logicalName,
          from: targetPkName,
          to: targetPkName,
          alias: `auto_link_${++this._linkAlias.value}`,
          linkType,
          builder: targetBuilder
        });
        this._links.push({
          name: intersectTable.name,
          from: pkName,
          to: pkName,
          alias: `auto_link_${++this._linkAlias.value}`,
          linkType,
          builder: intersectBuilder,
          intersect: true
        });
        return this;
      }
      const table = tableOrIntersect;
      const from = fromOrSubquery;
      const isFilterOnly = EntityQueryBuilder._isFilterOnlyLinkType(linkType);
      if (isFilterOnly) {
        const collector = new FilterCollector(table);
        subquery(collector);
        const fromFieldName = table.fields[from].name;
        const toFieldName = this._table.fields[to].name;
        this._links.push({
          name: table.logicalName,
          from: fromFieldName,
          to: toFieldName,
          alias: `auto_link_${++this._linkAlias.value}`,
          linkType,
          builder: collector,
          intersect: intersect ?? table.intersect === true
        });
      } else {
        const nestedBuilder = new EntityQueryBuilder(table, this._linkAlias);
        subquery(nestedBuilder);
        const fromFieldName = table.fields[from].name;
        const toFieldName = this._table.fields[to].name;
        this._links.push({
          name: table.logicalName,
          from: fromFieldName,
          to: toFieldName,
          alias: `auto_link_${++this._linkAlias.value}`,
          linkType,
          builder: nestedBuilder,
          intersect: intersect ?? table.intersect === true
        });
      }
      return this;
    }
    distinct() {
      this._isDistinct = true;
      return this;
    }
    top(n) {
      this._top = n;
      return this;
    }
    orderby(...args) {
      if (typeof args[0] === "function") {
        const result = args[0](this._proxy);
        const name = typeof result === "string" ? result : result.toString();
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
    toAst() {
      return {
        kind: "xml-select",
        entity: this._table.logicalName,
        version: "1.0",
        mapping: "logical",
        attributes: this._getEffectiveAttributes().map(fetchAttributeAst),
        filters: [...this._filters],
        orders: this._orders.map(fetchOrderAst),
        links: this._links.map((link) => {
          const child = link.builder instanceof FilterCollector ? void 0 : link.builder.toAst();
          return {
            name: link.name,
            from: link.from,
            to: link.to,
            alias: link.alias,
            linkType: link.linkType,
            intersect: link.intersect,
            attributes: child?.attributes ?? [],
            filters: link.builder instanceof FilterCollector ? [...link.builder._filters] : child?.filters ?? [],
            orders: child?.orders ?? [],
            links: child?.links ?? []
          };
        }),
        distinct: this._isDistinct,
        top: this._top,
        aggregateLimit: this._aggregateLimit,
        datasource: this._datasource,
        options: this._options,
        lateMaterialize: this._lateMaterialize,
        useRawOrderBy: this._useRawOrderBy
      };
    }
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
      const filterOnly = link.builder instanceof FilterCollector || EntityQueryBuilder._isFilterOnlyLinkType(link.linkType);
      const builderFilters = link.builder._filters ?? [];
      if (builderFilters.length > 0) {
        lines.push(`${childIndent}<filter type="and">`);
        for (const c of builderFilters) {
          lines.push(`${childIndent}  ${c}`);
        }
        lines.push(`${childIndent}</filter>`);
      }
      if (!filterOnly) {
        const eb = link.builder;
        for (const nestedAttr of eb._getEffectiveAttributes()) {
          const attrParts = [`name="${nestedAttr.name}"`, `alias="${nestedAttr.alias}"`];
          if (nestedAttr.aggregate) attrParts.push(`aggregate='${nestedAttr.aggregate}'`);
          if (nestedAttr.groupby) attrParts.push(`groupby='true'`);
          if (nestedAttr.dategrouping) attrParts.push(`dategrouping='${nestedAttr.dategrouping}'`);
          if (nestedAttr.distinct) attrParts.push(`distinct='true'`);
          if (nestedAttr.rowaggregate) attrParts.push(`rowaggregate='${nestedAttr.rowaggregate}'`);
          lines.push(`${childIndent}<attribute ${attrParts.join(" ")} />`);
        }
        const ebOrders = eb._orders ?? [];
        for (const order of ebOrders) {
          const parts = [`attribute='${order.attribute}'`];
          if (order.descending) parts.push(`descending='true'`);
          lines.push(`${childIndent}<order ${parts.join(" ")} />`);
        }
      }
      if (!(link.builder instanceof FilterCollector)) {
        const eb = link.builder;
        const ebLinks = eb._links ?? [];
        for (const nestedLink of ebLinks) {
          lines.push(...this._renderLinkEntity(nestedLink, childIndent));
        }
      }
      lines.push(`${indent}</link-entity>`);
      return lines;
    }
    toString() {
      return `fetchXml=${encodeURIComponent(this.toXml())}`;
    }
    _applyExecuteOptions(options) {
      if (options?.datasource) this._datasource = options.datasource;
      if (options?.lateMaterialize) this._lateMaterialize = true;
      if (options?.aggregateLimit !== void 0) this._aggregateLimit = options.aggregateLimit;
      if (options?.useRawOrderBy) this._useRawOrderBy = true;
      if (options?.options) this._options = options.options;
    }
    _transformRow(v) {
      const aliasInfo = this._buildAliasInfo();
      if (aliasInfo.size > 0) {
        const result = {};
        const recordId = v[this._table.primaryKey.property.fromDataverseName] ?? v[this._table.primaryKey.property.name] ?? "";
        const ctx = { table: this._table, client: this._table.client, recordId };
        for (const [alias, info] of aliasInfo) {
          if (info.name in v) {
            result[alias] = info.field ? info.field.transformFromDataverse(v[info.name], ctx) : v[info.name];
          } else {
            result[alias] = info.getDefault();
          }
        }
        result[Etag] = v["@odata.etag"];
        return result;
      }
      return this._table.transformValueFromDataverse(v);
    }
    async execute(options) {
      this._applyExecuteOptions(options);
      const results = [];
      for await (const page of this.iteratePages(options)) {
        results.push(...page);
      }
      return results;
    }
    async *iterate(options) {
      this._applyExecuteOptions(options);
      for await (const page of this.iteratePages(options)) {
        yield* page;
      }
    }
    async *iteratePages(options) {
      this._applyExecuteOptions(options);
      for await (const page of this._table.client.iteratePages(
        this._table.entitySetName,
        { ...options, query: this.toString() }
      )) {
        yield page.map((v) => this._transformRow(v));
      }
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
            field: FieldRef.fromPath(fieldDef, dataverseName),
            getDefault: () => fieldDef.getDefault?.(),
            name: dataverseName
          });
        } else {
          map.set(attr.alias, {
            field: void 0,
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
  function fetchXml(table) {
    return new FetchXmlInitialImpl(table);
  }
  class FetchXmlInitialImpl {
    #builder;
    constructor(table) {
      this.#builder = new EntityQueryBuilder(table);
    }
    select(selector) {
      if (selector) {
        return this.#builder.select(selector);
      }
      return this.#builder.select((f) => {
        const result = {};
        for (const key of Object.keys(f)) {
          result[key] = key;
        }
        return result;
      });
    }
    apply(expr) {
      this.#builder.apply(expr);
      return this.#builder._toAggregateQuery();
    }
    filter(filter) {
      this.#builder.filter(filter);
      return this;
    }
    join(...args) {
      this.#builder.join(...args);
      return this;
    }
    distinct() {
      this.#builder.distinct();
      return this;
    }
    top(n) {
      this.#builder.top(n);
      return this;
    }
    orderby(...args) {
      this.#builder.orderby(...args);
      return this;
    }
    toAst() {
      return this.#builder.toAst();
    }
    toXml() {
      return this.#builder.toXml();
    }
    toString() {
      return this.#builder.toString();
    }
    async execute(options) {
      return this.#builder.execute(options);
    }
    async *iterate(options) {
      yield* this.#builder.iterate(options);
    }
    async *iteratePages(options) {
      yield* this.#builder.iteratePages(options);
    }
  }

  const output = document.createElement("pre");
  output.style.cssText = "white-space:pre-wrap;font:14px monospace;padding:12px;background:#111;color:#eee;";
  document.body.append(output);
  function write(label, value) {
    const detail = value === void 0 ? "" : ` ${typeof value === "string" ? value : JSON.stringify(value, null, 2)}`;
    output.textContent += `[${(/* @__PURE__ */ new Date()).toISOString()}] ${label}${detail}
`;
  }
  function reportError(label, error) {
    write(label, error instanceof Error ? `${error.name}: ${error.message}
${error.stack ?? ""}` : error);
  }
  function assert(cond, msg) {
    if (!cond) throw new Error(`Assertion failed: ${msg}`);
  }
  function pngBlob() {
    const b64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";
    const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    return new Blob([bytes], { type: "image/png" });
  }
  let passed = 0;
  let failed = 0;
  async function test(name, fn) {
    try {
      await fn();
      passed++;
    } catch (e) {
      failed++;
      reportError(`FAILED: ${name}`, e);
    }
  }
  const client = new DataverseClient();
  const TestTable0 = new DataverseTable({
    logicalName: "nnsyc200_test_table",
    entitySetName: "nnsyc200_test_tables",
    client,
    fields: {
      id: primaryKey("nnsyc200_test_tableid"),
      bool: boolean("nnsyc200_boolean"),
      modifiedOn: datetime("modifiedon"),
      datetime: datetime("nnsyc200_datetime"),
      dateOnly: date("nnsyc200_dateonly"),
      stateCode: number("statecode"),
      int: number("nnsyc200_int"),
      versionNumber: number("versionnumber"),
      file: file("nnsyc200_file"),
      formula: string("nnsyc200_formula"),
      date: datetime("nnsyc200_date"),
      createdOn: datetime("createdon"),
      text: string("nnsyc200_text"),
      statusCode: number("statuscode"),
      image: image("nnsyc200_image"),
      name: string("nnsyc200_name")
    }
  });
  const TestTable = new DataverseTable({
    logicalName: "nnsyc200_test_table",
    entitySetName: "nnsyc200_test_tables",
    client,
    fields: {
      id: primaryKey("nnsyc200_test_tableid"),
      bool: boolean("nnsyc200_boolean"),
      modifiedOn: datetime("modifiedon"),
      testLookup: lookupId("nnsyc200_Test_Lookup", () => TestTable0),
      datetime: datetime("nnsyc200_datetime"),
      dateOnly: date("nnsyc200_dateonly"),
      stateCode: number("statecode"),
      int: number("nnsyc200_int"),
      versionNumber: number("versionnumber"),
      file: file("nnsyc200_file"),
      formula: string("nnsyc200_formula"),
      date: datetime("nnsyc200_date"),
      createdOn: datetime("createdon"),
      text: string("nnsyc200_text"),
      statusCode: number("statuscode"),
      image: image("nnsyc200_image"),
      name: string("nnsyc200_name")
    }
  });
  async function run() {
    const created = [];
    let parentId;
    let childId;
    let child2Id;
    try {
      await test("WhoAmI returns a userId", async () => {
        const r = await WhoAmI(client);
        assert(r && r.UserId, "UserId missing from WhoAmI response");
      });
      await test("seed parent record", async () => {
        parentId = await TestTable0.insertRecord({
          name: "smoke-parent",
          int: 100,
          bool: true,
          text: "parent"
        });
        assert(parentId, "parent id missing");
        created.push(parentId);
      });
      await test("seed child record (no file/image)", async () => {
        assert(parentId, "parent must exist first");
        childId = await TestTable.insertRecord({
          name: "smoke-child",
          int: 5,
          bool: false,
          text: "child",
          testLookup: parentId
        });
        assert(childId, "child id missing");
        created.push(childId);
      });
      await test("insertRecord returned GUIDs", () => {
        assert(parentId && childId, "insert ids missing");
      });
      await test("getRecords filter/orderby/top (OData, transformed)", async () => {
        assert(childId, "child must exist");
        const rows = await TestTable.getRecords({
          filter: "nnsyc200_int gt 0",
          orderby: "nnsyc200_name asc",
          top: 10
        });
        assert(Array.isArray(rows) && rows.length >= 1, "expected at least one row");
        const child = rows.find((r) => r.id === childId);
        assert(child, "seeded child not returned by query");
        assert(child.testLookup === parentId, "lookupId value not persisted");
      });
      await test("fetchOdata select + filter", async () => {
        const q = fetchOdata(TestTable).select((f) => ({ name: f.name, int: f.int })).filter("nnsyc200_int gt 0").toString();
        const rows = await client.getRecords(TestTable.entitySetName, { query: q });
        assert(Array.isArray(rows) && rows.length >= 1, "expected odata rows");
      });
      await test("fetchXml select + filter + top", async () => {
        const fx = fetchXml(TestTable).select((f) => ({ name: f.name, int: f.int })).filter("nnsyc200_int gt 0").top(10).toString();
        const rows = await client.getRecords(TestTable.entitySetName, { query: fx });
        assert(Array.isArray(rows) && rows.length >= 1, "expected fetchxml rows");
      });
      await test("getPropertyValue (value column)", async () => {
        assert(childId, "child must exist");
        const v = await TestTable.getPropertyValue("text", childId);
        assert(v === "child", `expected 'child', got ${JSON.stringify(v)}`);
      });
      await test("updatePropertyValue + read back", async () => {
        assert(childId, "child must exist");
        await TestTable.updatePropertyValue("text", childId, "child-updated");
        const v = await TestTable.getPropertyValue("text", childId);
        assert(v === "child-updated", `expected updated text, got ${JSON.stringify(v)}`);
      });
      await test("deletePropertyValue clears value", async () => {
        assert(childId, "child must exist");
        await TestTable.deletePropertyValue("text", childId);
        const v = await TestTable.getPropertyValue("text", childId);
        assert(v === null || v === void 0, `expected null, got ${JSON.stringify(v)}`);
      });
      await test("updateRecord persists", async () => {
        assert(childId, "child must exist");
        await TestTable.updateRecord(childId, { int: 42 });
        const rows = await TestTable.getRecords({
          filter: `nnsyc200_test_tableid eq ${childId}`
        });
        assert(rows[0] && rows[0].int === 42, "updateRecord int not persisted");
      });
      await test("upsertRecord (update path) persists", async () => {
        assert(childId, "child must exist");
        await TestTable.upsertRecord(childId, { text: "upserted" });
        const v = await TestTable.getPropertyValue("text", childId);
        assert(v === "upserted", `upsert text not persisted, got ${JSON.stringify(v)}`);
      });
      await test("file + image upload via afterSave (updateRecord)", async () => {
        assert(childId, "child must exist");
        await TestTable.updateRecord(childId, {
          file: { name: "smoke.txt", data: new Blob(["hello file"]) },
          image: { data: pngBlob() }
        });
      });
      await test("file + image upload via afterSave (insertRecord)", async () => {
        assert(parentId, "parent must exist first");
        child2Id = await TestTable.insertRecord({
          name: "smoke-child2",
          int: 7,
          text: "child2",
          testLookup: parentId,
          file: { name: "smoke2.txt", data: new Blob(["hello2"]) },
          image: { data: pngBlob() }
        });
        assert(child2Id, "child2 id missing");
        created.push(child2Id);
      });
    } catch (e) {
      reportError("unexpected error in run()", e);
    } finally {
      for (const id of created) {
        try {
          await TestTable.deleteRecord(id);
        } catch {
        }
        try {
          await TestTable0.deleteRecord(id);
        } catch {
        }
      }
      write(`smoke test complete: ${passed} passed, ${failed} failed`);
    }
  }
  window.addEventListener("error", (e) => reportError("window error", e.error ?? e.message));
  window.addEventListener("unhandledrejection", (e) => reportError("unhandled rejection", e.reason));
  if (document.body) {
    void run();
  } else {
    window.addEventListener("DOMContentLoaded", () => void run(), { once: true });
  }

})();
