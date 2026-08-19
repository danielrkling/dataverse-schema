(function () {
  'use strict';

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
    /**
     * Creates a record and returns its full representation.
     *
     * @example
     * const newAccount = await client.postRecord("accounts",
     *   { name: "New Account", revenue: 50000 })
     */
    async postRecord(entitySetName, value, options = {}) {
      return this.fetch(this._resource(getName(entitySetName), options.query), {
        method: "POST",
        headers: { Prefer: "return=representation" },
        body: JSON.stringify(value),
        signal: options.signal
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
    async postRecordGetId(entitySetName, value, options) {
      return this.fetch(getName(entitySetName), {
        method: "POST",
        body: JSON.stringify(value),
        ...options
      }).then((id) => {
        if (typeof id !== "string" || !id) {
          throw new Error("Dataverse did not return a record ID");
        }
        return id;
      });
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

  async function WhoAmI(client) {
    return client.fetch(`WhoAmI()`).then((r) => ({
      BusinessUnitId: r.BusinessUnitId,
      UserId: r.UserId,
      OrganizationId: r.OrganizationId
    }));
  }

  const output = document.createElement("pre");
  output.style.cssText = "white-space:pre-wrap;font:14px monospace;padding:12px;background:#111;color:#eee;";
  function write(label, value) {
    const detail = value === void 0 ? "" : ` ${typeof value === "string" ? value : JSON.stringify(value, null, 2)}`;
    output.textContent += `[${(/* @__PURE__ */ new Date()).toISOString()}] ${label}${detail}
`;
  }
  function reportError(label, error) {
    write(label, error instanceof Error ? `${error.name}: ${error.message}
${error.stack ?? ""}` : error);
  }
  async function run() {
    document.body.append(output);
    write("browser smoke test started");
    write("location", location.href);
    try {
      const client = new DataverseClient();
      write("client created");
      const result = await WhoAmI(client);
      write("WhoAmI succeeded", result);
    } catch (error) {
      reportError("smoke test failed", error);
    }
  }
  window.addEventListener("error", (event) => reportError("window error", event.error ?? event.message));
  window.addEventListener("unhandledrejection", (event) => reportError("unhandled rejection", event.reason));
  if (document.body) {
    void run();
  } else {
    window.addEventListener("DOMContentLoaded", () => void run(), { once: true });
  }

})();
