(function () {
  'use strict';

  const ETAG = "$etag";
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
          throw new DataverseHttpError(
            `${response.status} ${data.error.message ?? response.statusText}`,
            response.status,
            response.statusText,
            data.error,
            response
          );
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
          ...options.ifNoneMatch ? { headers: { "If-None-Match": options.ifNoneMatch } } : {},
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
      if (options.ifMatch) extraHeaders["If-Match"] = options.ifMatch;
      if (options.ifNoneMatch) extraHeaders["If-None-Match"] = options.ifNoneMatch;
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
      if (options.ifMatch) request.headers = { "If-Match": options.ifMatch };
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
      if (options.ifMatch) request.headers = { "If-Match": options.ifMatch };
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
      return this.fetch(`${getName(entitySetName)}(${id})/${getName(propertyName)}`, options).then((r) => r ? r.value : void 0);
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

  async function RetrieveTotalRecordCount(client, logicalName) {
    return client.fetch(
      `RetrieveTotalRecordCount(EntityNames=['${logicalName}'])`
    ).then((d) => {
      const collection = d?.Values ?? d?.EntityNameCountCollection ?? [];
      const entry = collection[0];
      if (entry == null) return 0;
      if (typeof entry === "number") return entry;
      return Number(entry.Count ?? entry.count ?? entry.Value ?? 0);
    });
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

  //#endregion
  //#region src/utils/_joinExpects/_joinExpects.ts
  /**
  * Joins multiple `expects` values with the given separator.
  *
  * @param values The `expects` values.
  * @param separator The separator.
  *
  * @returns The joined `expects` property.
  *
  * @internal
  */
  /* @__NO_SIDE_EFFECTS__ */
  function _joinExpects(values$1, separator) {
  	const list = [...new Set(values$1)];
  	if (list.length > 1) return `(${list.join(` ${separator} `)})`;
  	return list[0] ?? "never";
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
  //#region src/schemas/array/array.ts
  /* @__NO_SIDE_EFFECTS__ */
  function array(item, message$1) {
  	return {
  		kind: "schema",
  		type: "array",
  		reference: array,
  		expects: "Array",
  		async: false,
  		item,
  		message: message$1,
  		get "~standard"() {
  			return /* @__PURE__ */ _getStandardProps(this);
  		},
  		"~run"(dataset, config$1) {
  			const input = dataset.value;
  			if (Array.isArray(input)) {
  				dataset.typed = true;
  				dataset.value = [];
  				for (let key = 0; key < input.length; key++) {
  					const value$1 = input[key];
  					const itemDataset = this.item["~run"]({ value: value$1 }, config$1);
  					if (itemDataset.issues) {
  						const pathItem = {
  							type: "array",
  							origin: "value",
  							input,
  							key,
  							value: value$1
  						};
  						for (const issue of itemDataset.issues) {
  							if (issue.path) issue.path.unshift(pathItem);
  							else issue.path = [pathItem];
  							dataset.issues?.push(issue);
  						}
  						if (!dataset.issues) dataset.issues = itemDataset.issues;
  						if (config$1.abortEarly) {
  							dataset.typed = false;
  							break;
  						}
  					}
  					if (!itemDataset.typed) dataset.typed = false;
  					dataset.value.push(itemDataset.value);
  				}
  			} else _addIssue(this, "type", dataset, config$1);
  			return dataset;
  		}
  	};
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
  //#region src/schemas/custom/custom.ts
  /* @__NO_SIDE_EFFECTS__ */
  function custom(check$1, message$1) {
  	return {
  		kind: "schema",
  		type: "custom",
  		reference: custom,
  		expects: "unknown",
  		async: false,
  		check: check$1,
  		message: message$1,
  		get "~standard"() {
  			return /* @__PURE__ */ _getStandardProps(this);
  		},
  		"~run"(dataset, config$1) {
  			if (this.check(dataset.value)) dataset.typed = true;
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
  //#region src/schemas/lazy/lazy.ts
  /**
  * Creates a lazy schema.
  *
  * @param getter The schema getter.
  *
  * @returns A lazy schema.
  */
  /* @__NO_SIDE_EFFECTS__ */
  function lazy(getter) {
  	return {
  		kind: "schema",
  		type: "lazy",
  		reference: lazy,
  		expects: "unknown",
  		async: false,
  		getter,
  		get "~standard"() {
  			return /* @__PURE__ */ _getStandardProps(this);
  		},
  		"~run"(dataset, config$1) {
  			return this.getter(dataset.value)["~run"](dataset, config$1);
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
  //#region src/schemas/picklist/picklist.ts
  /* @__NO_SIDE_EFFECTS__ */
  function picklist(options, message$1) {
  	return {
  		kind: "schema",
  		type: "picklist",
  		reference: picklist,
  		expects: /* @__PURE__ */ _joinExpects(options.map(_stringify), "|"),
  		async: false,
  		options,
  		message: message$1,
  		get "~standard"() {
  			return /* @__PURE__ */ _getStandardProps(this);
  		},
  		"~run"(dataset, config$1) {
  			if (this.options.includes(dataset.value)) dataset.typed = true;
  			else _addIssue(this, "type", dataset, config$1);
  			return dataset;
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
          schemaName: name,
          logicalName: name,
          fromDataverseName: name,
          toDataverseName: name,
          transformValueFromDataverse: (value) => value,
          transformValueToDataverse: (value) => value
        };
        this._path = path ?? name;
        this.path = pathSegments ?? [this.field];
      } else {
        const f = field;
        this.field = f;
        this._path = path ?? f.fromDataverseName;
        this.path = pathSegments ?? [f];
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
    return property.fromDataverseName ?? property.logicalName;
  }
  function fieldPathName(path) {
    return path.map(propertyName).join("/");
  }

  function renderFilterOdata(node, scope) {
    const fieldName = (path) => `${scope ? `${scope}/` : ""}${fieldPathName(path)}`;
    switch (node.type) {
      case "comparison":
        return `(${fieldName(node.field)} ${node.operator} ${wrapString(node.value)})`;
      case "null":
        return `${fieldName(node.field)} ${node.positive ? "eq" : "ne"} null`;
      case "contains":
        return `contains(${fieldName(node.field)},${wrapString(node.value)})`;
      case "startsWith":
        return `startswith(${fieldName(node.field)},${wrapString(node.value)})`;
      case "endsWith":
        return `endswith(${fieldName(node.field)},${wrapString(node.value)})`;
      case "compare":
        return `(${fieldName(node.field)} ${node.operator} ${fieldName(node.otherField)})`;
      case "lambda":
        return `${fieldPathName(node.field)}/${node.operator}(${node.alias}: ${renderFilterOdata(node.condition, node.alias)})`;
      case "fn": {
        const field = wrapString(fieldName(node.field));
        const vals = node.values.map(wrapString);
        if (vals.length === 0) return `Microsoft.Dynamics.CRM.${node.fnName}(PropertyName=${field})`;
        if (vals.length === 1) return `Microsoft.Dynamics.CRM.${node.fnName}(PropertyName=${field},PropertyValue=${vals[0]})`;
        if (node.fnName === "Between" || node.fnName === "NotBetween") return `Microsoft.Dynamics.CRM.${node.fnName}(PropertyName=${field},PropertyValues=[${vals.join(",")}])`;
        if (node.fnName === "InFiscalPeriodAndYear" || node.fnName === "InOrAfterFiscalPeriodAndYear" || node.fnName === "InOrBeforeFiscalPeriodAndYear") return `Microsoft.Dynamics.CRM.${node.fnName}(PropertyName=${field},PropertyValue1=${vals[0]},PropertyValue2=${vals[1]})`;
        return `Microsoft.Dynamics.CRM.${node.fnName}(PropertyName=${field},PropertyValues=[${vals.join(",")}])`;
      }
      case "raw":
        return node.value;
      case "and":
        return node.conditions.length === 0 ? "" : `(${node.conditions.map((child) => renderFilterOdata(child, scope)).join(" and ")})`;
      case "or":
        return node.conditions.length === 0 ? "" : `(${node.conditions.map((child) => renderFilterOdata(child, scope)).join(" or ")})`;
      case "not":
        return `not(${renderFilterOdata(node.condition, scope)})`;
    }
  }

  function escapeXml(value) {
    return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
  }
  function renderFilterFetchXml(node) {
    const fieldName = (path) => fieldPathName(path);
    switch (node.type) {
      case "comparison":
        return `<condition attribute="${escapeXml(fieldName(node.field))}" operator="${escapeXml(node.operator)}" value="${node.value === null ? "" : escapeXml(String(node.value))}" />`;
      case "null":
        return `<condition attribute="${escapeXml(fieldName(node.field))}" operator="${node.positive ? "null" : "not-null"}" />`;
      case "contains":
        return `<condition attribute="${escapeXml(fieldName(node.field))}" operator="like" value="%${escapeXml(node.value)}%" />`;
      case "startsWith":
        return `<condition attribute="${escapeXml(fieldName(node.field))}" operator="begins-with" value="${escapeXml(node.value)}" />`;
      case "endsWith":
        return `<condition attribute="${escapeXml(fieldName(node.field))}" operator="ends-with" value="${escapeXml(node.value)}" />`;
      case "compare":
        return `<condition attribute="${escapeXml(fieldName(node.field))}" operator="${escapeXml(node.operator)}" valueof="${escapeXml(fieldName(node.otherField))}" />`;
      case "lambda":
        return `<condition entityname="${escapeXml(fieldName(node.field))}" operator="${escapeXml(node.operator)}" value="${escapeXml(`${node.alias}: ${renderFilterFetchXml(node.condition)}`)}" />`;
      case "fn": {
        const attr = escapeXml(fieldName(node.field));
        const op = escapeXml(node.operator);
        if (node.values.length === 0) return `<condition attribute="${attr}" operator="${op}" />`;
        if (node.values.length === 1) return `<condition attribute="${attr}" operator="${op}" value="${escapeXml(String(node.values[0]))}" />`;
        return `<condition attribute="${attr}" operator="${op}">${node.values.map((value) => `<value>${escapeXml(String(value))}</value>`).join("")}</condition>`;
      }
      case "raw":
        return node.value;
      case "and":
        return node.conditions.length === 0 ? "" : `<filter type="and">${node.conditions.map(renderFilterFetchXml).join("")}</filter>`;
      case "or":
        return node.conditions.length === 0 ? "" : `<filter type="or">${node.conditions.map(renderFilterFetchXml).join("")}</filter>`;
      case "not":
        return `<filter type="and"><filter type="or">${renderFilterFetchXml(node.condition)}</filter></filter>`;
    }
  }

  function pathOf(field) {
    return field.path;
  }
  function toFilterValue(field, value) {
    if (value == null || typeof value !== "string") return value;
    const f = field.field;
    if (f?.type !== "choice") return value;
    return f.transformValueToDataverse(value);
  }
  class FilterExpr {
    constructor(node) {
      this.node = node;
    }
    toString() {
      return this.toOdata();
    }
    toOdata() {
      return renderFilterOdata(this.node);
    }
    toFetchXml() {
      return renderFilterFetchXml(this.node);
    }
    getNode() {
      return this.node;
    }
  }
  function eq(field, value) {
    if (value instanceof FieldRef) {
      return new FilterExpr({ type: "compare", field: pathOf(field), operator: "eq", otherField: pathOf(value) });
    }
    return new FilterExpr({ type: "comparison", field: pathOf(field), operator: "eq", value: toFilterValue(field, value) });
  }
  function gt(field, value) {
    if (value instanceof FieldRef) {
      return new FilterExpr({ type: "compare", field: pathOf(field), operator: "gt", otherField: pathOf(value) });
    }
    return new FilterExpr({ type: "comparison", field: pathOf(field), operator: "gt", value: toFilterValue(field, value) });
  }
  function lt(field, value) {
    if (value instanceof FieldRef) {
      return new FilterExpr({ type: "compare", field: pathOf(field), operator: "lt", otherField: pathOf(value) });
    }
    return new FilterExpr({ type: "comparison", field: pathOf(field), operator: "lt", value: toFilterValue(field, value) });
  }
  function contains(field, value) {
    return new FilterExpr({ type: "contains", field: pathOf(field), value });
  }
  function startsWith(field, value) {
    return new FilterExpr({ type: "startsWith", field: pathOf(field), value });
  }
  function and(...conditions) {
    const valid = conditions.filter((c) => c != null && c !== "");
    const exprs = valid.map((c) => typeof c === "string" ? new FilterExpr({ type: "raw", value: c }) : c);
    return new FilterExpr({ type: "and", conditions: exprs.map((expr) => expr.getNode()) });
  }
  function or(...conditions) {
    const valid = conditions.filter((c) => c != null && c !== "");
    const exprs = valid.map((c) => typeof c === "string" ? new FilterExpr({ type: "raw", value: c }) : c);
    return new FilterExpr({ type: "or", conditions: exprs.map((expr) => expr.getNode()) });
  }
  function not(condition) {
    const c = typeof condition === "string" ? new FilterExpr({ type: "raw", value: condition }) : condition;
    return new FilterExpr({ type: "not", condition: c.getNode() });
  }

  function fieldName(field) {
    return typeof field === "string" ? field : field.toString();
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
  function sum(field) {
    return new Aggregation("sum", fieldName(field), field);
  }
  function min(field) {
    return new Aggregation("min", fieldName(field), field);
  }
  function max(field) {
    return new Aggregation("max", fieldName(field), field);
  }
  function average(field) {
    return new Aggregation("average", fieldName(field), field);
  }
  function count(field) {
    return new Aggregation("count", field ? fieldName(field) : void 0, field);
  }
  function groupby(field) {
    return new GroupByExpr(fieldName(field), field);
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
      r[ETAG] = v["@odata.etag"];
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
          if (prop.kind === "value" || prop.type === "lookupId") {
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
        dvName: prop.fromDataverseName,
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
        expands: this.#expands.map((expand) => ({ navigation: expand.navigation.fromDataverseName, query: expand.query })),
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
      const recordId = value[this.#table.primaryKey.property.fromDataverseName] ?? value[this.#table.primaryKey.property.logicalName];
      const ctx = { table: this.#table, client: this.#table.client, recordId: recordId ?? "" };
      for (const key of this.#selectedKeys) {
        const prop = this.#table.fields[key];
        result[key] = FieldRef.fromPath(prop, prop.fromDataverseName ?? prop.logicalName).transformFromDataverse(value[prop.fromDataverseName], ctx);
      }
      for (const expand of this.#expandMeta) {
        if (value[expand.dvName] !== void 0) {
          result[expand.key] = _processExpand(value[expand.dvName], expand, this.#table);
        }
      }
      result[ETAG] = value["@odata.etag"];
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
    const recordId = raw[table.primaryKey.property.fromDataverseName] ?? raw[table.primaryKey.property.logicalName];
    const ctx = { table, client: table.client, recordId: recordId ?? "" };
    for (const key of selectedKeys) {
      const prop = table.fields[key];
      if (prop) {
        result[key] = FieldRef.fromPath(prop, prop.fromDataverseName ?? prop.logicalName).transformFromDataverse(raw[prop.fromDataverseName], ctx);
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
      const dataverseName = prop.fromDataverseName ?? prop.logicalName;
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
  function buildLambdaProxy(alias, table) {
    const fields = table.fields;
    const proxy = {};
    for (const [key, prop] of Object.entries(fields)) {
      proxy[key] = FieldRef.fromPath(prop, `${alias}/${prop.fromDataverseName ?? prop.logicalName}`);
    }
    return proxy;
  }
  function any(proxy, condition) {
    const alias = "x";
    const table = proxyTableMap.get(proxy);
    if (!table) throw new Error("any() requires a collection navigation proxy");
    const result = condition(buildLambdaProxy(alias, table));
    return new FilterExpr({
      type: "lambda",
      field: proxyPathMap.get(proxy) ?? [],
      operator: "any",
      alias,
      condition: result instanceof FilterExpr ? result.getNode() : { type: "raw", value: result }
    });
  }
  function all(proxy, condition) {
    const alias = "x";
    const table = proxyTableMap.get(proxy);
    if (!table) throw new Error("all() requires a collection navigation proxy");
    const result = condition(buildLambdaProxy(alias, table));
    return new FilterExpr({
      type: "lambda",
      field: proxyPathMap.get(proxy) ?? [],
      operator: "all",
      alias,
      condition: result instanceof FilterExpr ? result.getNode() : { type: "raw", value: result }
    });
  }
  function fetchOdata(table) {
    return new InitialQueryImpl(table);
  }
  function buildTableQueryAst(table, options) {
    const query = new ODataQuery(table);
    query.select();
    if (options?.filter) query.filter(options.filter);
    if (options?.top !== void 0) query.top(options.top);
    if (typeof options?.orderby === "string") {
      for (const value of options.orderby.split(",")) {
        const [field, direction = "asc"] = value.trim().split(/\s+/);
        if (field) query.orderby(field, direction);
      }
    } else {
      for (const [field, direction] of Object.entries(options?.orderby ?? {})) {
        const property = table.fields[field]?.fromDataverseName ?? table.fields[field]?.logicalName ?? field;
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
      }).then((v2) => this.transformValueFromDataverse(v2)).catch((err) => {
        if (err instanceof DataverseHttpError && err.status === 404) return null;
        throw err;
      });
    }
    getAlternateKeys(value) {
      return Object.entries(value).map((kv) => `${this.fields[kv[0]].logicalName}=${kv[1]}`).join(",");
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
        const propertyName = prop.type === "lookupId" ? prop.fromDataverseName : prop.logicalName;
        return this.client.getPropertyValue(this.entitySetName, id, propertyName).then((v2) => prop.transformValueFromDataverse(v2));
      }
      if (prop.type === "collection" || prop.type === "collectionIds") {
        return this.client.getAssociatedRecords(
          this.entitySetName,
          id,
          prop.schemaName,
          { query: tableQuery(prop.table, queryOptions) }
        ).then(
          (v2) => prop.transformValueFromDataverse(v2)
        );
      }
      if (prop.type === "lookup") {
        return this.client.getAssociatedRecord(
          this.entitySetName,
          id,
          prop.schemaName,
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
     * File/image columns accept `{ data: Blob | null }` to upload/clear content.
     * Throws for fields marked `readonly`.
     *
     * @example
     * await Person.updatePropertyValue("age", "some-guid", 35);
     */
    async updatePropertyValue(key, id, value) {
      const prop = this.fields[key];
      if (prop.getReadOnly()) throw new Error(`Cannot update readonly property "${String(key)}"`);
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
        if (v2 === SKIP) {
          if (prop.afterSave) await prop.afterSave(ctx, value);
        } else {
          await this.client.updatePropertyValue(
            this.entitySetName,
            id,
            this.fields[key].logicalName,
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
          prop.schemaName,
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
        return this.client.dissociateRecord(this.entitySetName, id, prop.schemaName, childId);
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
     * const newId = await Person.createRecord({ name: "John", age: 30 });
     */
    async createRecord(value, options) {
      const pkName = this.primaryKey.property.logicalName;
      const record = await this.client.postRecord(
        this.entitySetName,
        await this.transformValueToDataverse(value),
        { query: selectQuery(pkName), signal: options?.signal }
      );
      const guid = record?.[pkName];
      const ctx = { table: this, client: this.client, recordId: guid };
      await this._afterSave(ctx, value);
      return guid;
    }
    /**
     * Updates an existing record by ID. Supports optimistic concurrency via the
     * `ifMatch` option (If-Match header). When `ifMatch` is omitted it defaults
     * to `"*"`, which updates the record only if it already exists.
     *
     * @param id The record's primary key.
     * @param value The fields to update (partial record data).
     * @param options Mutation options (`ifMatch`, `ifNoneMatch`, `signal`).
     *
     * @example
     * await Person.updateRecord("some-guid", { name: "Jane" });
     * // Conditional update:
     * await Person.updateRecord("some-guid", { name: "Jane" }, { ifMatch: 'W/"123456"' });
     */
    async updateRecord(id, value, options) {
      if (!id) throw new Error("No ID provided");
      const ctx = { table: this, client: this.client, recordId: id };
      await this.client.patchRecord(
        this.entitySetName,
        id,
        await this.transformValueToDataverse(value, ctx),
        { ifMatch: options?.ifMatch ?? "*", ifNoneMatch: options?.ifNoneMatch, signal: options?.signal }
      );
      await this._afterSave(ctx, value);
      return id;
    }
    /**
     * Creates or updates a record. If `id` is provided the record is updated via
     * PATCH; otherwise a new record is created via POST. Navigation properties
     * (collections, lookups) are also synced through nested upserts.
     *
     * @param id The GUID of an existing record, or `undefined` to create new.
     * @param value The record data (partial for updates).
     * @param options Mutation options (`ifMatch`, `ifNoneMatch`, `signal`).
     *
     * @example
     * // Create
     * const newId = await Person.upsertRecord(undefined, { name: "John" });
     * // Update
     * await Person.upsertRecord(existingId, { name: "Jane" });
     */
    async upsertRecord(id, value, options) {
      const pkName = this.primaryKey.property.logicalName;
      const ctx = { table: this, client: this.client, recordId: "" };
      if (id) {
        ctx.recordId = id;
        const transformed = await this.transformValueToDataverse(value, ctx);
        await this.client.patchRecord(
          this.entitySetName,
          id,
          transformed,
          { query: selectQuery(pkName), ifMatch: options?.ifMatch, ifNoneMatch: options?.ifNoneMatch, signal: options?.signal }
        );
      } else {
        const record = await this.client.postRecord(
          this.entitySetName,
          await this.transformValueToDataverse(value),
          { query: selectQuery(pkName), signal: options?.signal }
        );
        id = record[pkName];
        ctx.recordId = id;
      }
      await this._afterSave(ctx, value);
      return id;
    }
    /**
     * Deletes a record by its primary key. Supports optimistic concurrency via the
     * `ifMatch` option (If-Match header).
     *
     * @param id The primary key of the record to delete.
     * @param options Mutation options (`ifMatch`, `ifNoneMatch`, `signal`).
     *
     * @example
     * await Person.deleteRecord("some-guid");
     */
    async deleteRecord(id, options) {
      return this.client.deleteRecord(this.entitySetName, id, { ifMatch: options?.ifMatch, signal: options?.signal });
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
     * on navigation properties or fields marked `readonly` — use the dedicated
     * `deleteFile`/`deleteImage` helpers for file and image columns.
     *
     * @example
     * await Person.deletePropertyValue("name", "some-guid");
     */
    async deletePropertyValue(key, id) {
      const prop = this.fields[key];
      if (prop.getReadOnly()) throw new Error(`Cannot delete readonly property "${String(key)}"`);
      if (prop.kind === "value") {
        return this.client.deletePropertyValue(this.entitySetName, id, prop.logicalName);
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
      const targets = await Promise.all(records.map(async (r) => ({
        "@odata.type": `Microsoft.Dynamics.CRM.${this.logicalName}`,
        ...await this.transformValueToDataverse(r)
      })));
      return this.client.createMultiple(this.entitySetName, targets);
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
      const targets = await Promise.all(records.map(async (r) => ({
        "@odata.type": `Microsoft.Dynamics.CRM.${this.logicalName}`,
        ...await this.transformValueToDataverse(r)
      })));
      return this.client.updateMultiple(this.entitySetName, targets);
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
      result[ETAG] = value["@odata.etag"];
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
      await this.client.deletePropertyValue(this.entitySetName, id, field.logicalName);
    }
    async downloadImage(id, fieldName) {
      const field = this.fields[fieldName];
      if (!field || field.type !== "image") throw new Error(`"${fieldName}" is not an image column`);
      const response = await this.client.fetch(`${this.entitySetName}(${id})/${field.logicalName}/$value`, { raw: true });
      if (!response.ok) throw new Error(response.status + "-" + response.statusText);
      return response.blob();
    }
    async deleteImage(id, fieldName) {
      const field = this.fields[fieldName];
      if (!field || field.type !== "image") throw new Error(`"${fieldName}" is not an image column`);
      await this.client.deletePropertyValue(this.entitySetName, id, field.logicalName);
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
    /** Canonical Dataverse schema name (e.g. `nnsyc200_Test_Lookup`). */
    schemaName;
    /** Lowercased logical name (e.g. `nnsyc200_test_lookup`), used for `$select`, `$filter`, FetchXML attributes. */
    logicalName;
    fromDataverseName;
    toDataverseName;
    kind;
    type;
    schema;
    #default;
    #readOnly;
    constructor(name, defaults, options) {
      this.schemaName = name;
      this.logicalName = name.toLowerCase();
      this.fromDataverseName = this.logicalName;
      this.toDataverseName = this.logicalName;
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
  function buildObjectSchema(fields) {
    const shape = {};
    for (const [key, field] of Object.entries(fields)) {
      shape[key] = field.schema;
    }
    return object(shape);
  }
  class BooleanField extends FieldBase {
    kind = "value";
    type = "boolean";
    constructor(name, options) {
      super(name, { defaultValue: false, schema: boolean$1() }, options);
    }
    transformValueFromDataverse(value) {
      if (typeof value === "string") return value.toLowerCase() === "true";
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
      if (typeof value === "string") {
        const n = Number(value);
        return Number.isFinite(n) ? n : 0;
      }
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
  class MultiChoiceField extends FieldBase {
    kind = "value";
    type = "multiChoice";
    choices;
    constructor(name, choices, options) {
      const values = (Array.isArray(choices) ? [...choices] : Object.keys(choices).map(Number)).sort((a, b) => a - b);
      if (values.length === 0) throw new Error("Multi-choice fields require at least one value");
      super(name, {
        defaultValue: [],
        schema: array(custom((value) => values.includes(value), `Value not in [${values}]`))
      }, options);
      this.choices = Object.freeze(values);
    }
    getDefault() {
      return [...super.getDefault()];
    }
    transformValueFromDataverse(value) {
      if (value == null || value === "") return [];
      if (Array.isArray(value)) return value.map((v2) => Number(v2));
      return String(value).split(",").map((part) => Number(part.trim())).filter((n) => !Number.isNaN(n));
    }
    transformValueToDataverse(value) {
      if (value == null) return null;
      const arr = Array.isArray(value) ? value : [value];
      if (arr.length === 0) return null;
      return arr.map((v2) => Number(v2)).join(",");
    }
  }
  class ChoiceField extends FieldBase {
    kind = "value";
    type = "choice";
    /** Allowed labels (values of the choice map), frozen. */
    choices;
    #choices;
    constructor(name, choices, options) {
      const firstKey = Object.keys(choices)[0];
      if (firstKey === void 0) throw new Error("Choice fields require at least one option");
      const values = Object.values(choices);
      super(name, {
        defaultValue: choices[Number(firstKey)],
        schema: picklist(values)
      }, options);
      this.#choices = choices;
      this.choices = Object.freeze([...values]);
    }
    transformValueFromDataverse(value) {
      const result = this.#choices[value];
      if (result === void 0) throw new Error(`Unknown choice value: ${value} (${this.logicalName})`);
      return result;
    }
    transformValueToDataverse(value) {
      for (const [k, v2] of Object.entries(this.#choices)) {
        if (v2 === value) return Number(k);
      }
      throw new Error(`Unknown choice label: ${value}`);
    }
  }
  class DateTimeField extends FieldBase {
    kind = "value";
    type = "dateTime";
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
      if (value === void 0) return this.getDefault();
      if (value === null) throw new Error(`Invalid datetime value: ${value}`);
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
    getDefault() {
      return parseDateOnly((/* @__PURE__ */ new Date()).toISOString());
    }
    transformValueFromDataverse(value) {
      if (value === void 0) return this.getDefault();
      if (value === null) throw new Error(`Invalid date-only value: ${value}`);
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
      const fullSizeUrl = ctx.client.getImageFullSizeURL(ctx.table.entitySetName, ctx.recordId, this.logicalName);
      return { url, fullSizeUrl };
    }
    //When using conditional operations (If-Match) image columns are not allowed even though they are allowed normally. Workaround is to update property after save
    async transformValueToDataverse(_value, _ctx) {
      return SKIP;
    }
    async afterSave(ctx, value) {
      if (value?.data === null) {
        await ctx.client.deletePropertyValue(ctx.table.entitySetName, ctx.recordId, this.logicalName);
      } else if (value?.data instanceof Blob) {
        await ctx.client.updateFileProperty(ctx.table.entitySetName, ctx.recordId, this.logicalName, "image.png", value.data);
      }
    }
  }
  class FileField extends FieldBase {
    kind = "value";
    type = "file";
    constructor(name, options) {
      super(name, {
        defaultValue: null,
        schema: nullable(object({
          name: optional(string$1()),
          url: optional(string$1()),
          data: optional(nullable(instance(Blob)))
        }))
      }, options);
      this.fromDataverseName = `${name}_name`;
    }
    transformValueFromDataverse(value, ctx) {
      if (value == null) return null;
      if (!ctx) return { name: value };
      return {
        name: value,
        url: ctx.client.getPropertyRawValueURL(ctx.table.entitySetName, ctx.recordId, this.logicalName)
      };
    }
    transformValueToDataverse(_value, _ctx) {
      return SKIP;
    }
    async afterSave(ctx, value) {
      if (value?.data instanceof Blob) {
        const fileName = value.name ?? this.getDefault()?.name;
        if (fileName) {
          await ctx.client.updateFileProperty(ctx.table.entitySetName, ctx.recordId, this.logicalName, fileName, value.data);
        }
      } else if (value?.data === null) {
        await ctx.client.deletePropertyValue(ctx.table.entitySetName, ctx.recordId, this.logicalName);
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
  function multiChoice(name, choices, options) {
    return new MultiChoiceField(name, choices, options);
  }
  function choice(name, choices, options) {
    return new ChoiceField(name, choices, options);
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
    #getTable;
    constructor(name, getTable, options) {
      super(name, {
        defaultValue: null,
        schema: nullable(NON_EMPTY_STRING_SCHEMA)
      }, options);
      this.#getTable = getTable;
      this.fromDataverseName = `_${this.logicalName}_value`;
      this.toDataverseName = `${this.schemaName}@odata.bind`;
    }
    #table;
    get table() {
      if (!this.#table) {
        const table = this.#getTable();
        const { property } = table.primaryKey;
        this.#table = new DataverseTable({ client: table.client, entitySetName: table.entitySetName, logicalName: table.logicalName, fields: { id: property } });
      }
      return this.#table;
    }
    transformValueToDataverse(value) {
      if (value === null) return null;
      if (typeof value !== "string" || value.length === 0) {
        throw new Error("Lookup IDs must be non-empty strings");
      }
      return `${this.table.entitySetName}(${value})`;
    }
  }
  class CollectionProperty extends FieldBase {
    kind = "navigation";
    type = "collection";
    #getTable;
    constructor(name, getTable, options) {
      super(name, {
        defaultValue: [],
        schema: array(lazy(() => buildObjectSchema(getTable().fields)))
      }, options);
      this.#getTable = getTable;
      this.fromDataverseName = this.schemaName;
    }
    #table;
    get table() {
      return this.#table ??= this.#getTable();
    }
    transformValueFromDataverse(value) {
      return Array.from(value ?? []).map(
        (v2) => this.table.transformValueFromDataverse(v2)
      );
    }
    transformValueToDataverse() {
      return SKIP;
    }
    async afterSave(ctx, value) {
      if (!Array.isArray(value)) return;
      const ids = await Promise.all(
        value.map((v2) => this.table.upsertRecord(void 0, v2))
      );
      await ctx.client.associateRecordToList(
        ctx.table.entitySetName,
        ctx.recordId,
        this.schemaName,
        this.table.entitySetName,
        this.table.primaryKey.property.logicalName,
        ids
      );
    }
  }
  function collection(name, getTable, options) {
    return new CollectionProperty(name, getTable, options);
  }
  function lookupId(name, getTable, options) {
    return new LookupIdProperty(name, getTable, options);
  }
  class LookupProperty extends FieldBase {
    kind = "navigation";
    type = "lookup";
    #getTable;
    constructor(name, getTable, options) {
      super(name, {
        defaultValue: null,
        schema: nullable(lazy(() => buildObjectSchema(getTable().fields)))
      }, options);
      this.#getTable = getTable;
      this.fromDataverseName = this.schemaName;
    }
    #table;
    get table() {
      return this.#table ??= this.#getTable();
    }
    transformValueFromDataverse(value) {
      return value == null ? null : this.table.transformValueFromDataverse(value);
    }
    transformValueToDataverse() {
      return SKIP;
    }
    async afterSave(ctx, value) {
      if (value === null) {
        await ctx.client.dissociateRecord(ctx.table.entitySetName, ctx.recordId, this.schemaName);
      } else {
        const childId = await this.table.upsertRecord(void 0, value);
        await ctx.client.associateRecord(
          ctx.table.entitySetName,
          ctx.recordId,
          this.schemaName,
          this.table.entitySetName,
          childId
        );
      }
    }
  }
  function lookup(name, getTable, options) {
    return new LookupProperty(name, getTable, options);
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
            `Table "${this._table.entitySetName}" is not related to intersect table "${intersectTable.name}"`
          );
        }
        const targetBuilder = new EntityQueryBuilder(targetTable, this._linkAlias);
        subqueryFn(targetBuilder);
        const pkName = this._table.primaryKey.property.logicalName;
        const targetPkName = targetTable.primaryKey.property.logicalName;
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
      const fromFieldName = table.fields[from].logicalName;
      const toFieldName = this._table.fields[to].logicalName;
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
        const recordId = v[this._table.primaryKey.property.fromDataverseName] ?? v[this._table.primaryKey.property.logicalName] ?? "";
        const ctx = { table: this._table, client: this._table.client, recordId };
        for (const [alias, info] of aliasInfo) {
          if (info.name in v) {
            result[alias] = info.field ? info.field.transformFromDataverse(v[info.name], ctx) : v[info.name];
          } else {
            result[alias] = info.getDefault();
          }
        }
        result[ETAG] = v["@odata.etag"];
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
          ([_, f]) => (f.fromDataverseName ?? f.logicalName) === attr.name
        );
        if (entry) {
          const fieldDef = entry[1];
          const dataverseName = fieldDef.fromDataverseName ?? fieldDef.logicalName;
          map.set(attr.alias, {
            field: FieldRef.fromPath(fieldDef, dataverseName),
            getDefault: () => fieldDef.getDefault?.(),
            name: attr.alias
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
          ([_, f]) => (f.fromDataverseName ?? f.logicalName) === attr.name
        );
        if (entry) {
          const fieldDef = entry[1];
          const dataverseName = fieldDef.fromDataverseName ?? fieldDef.logicalName;
          map.set(attr.alias, {
            field: FieldRef.fromPath(fieldDef, dataverseName),
            getDefault: () => fieldDef.getDefault?.(),
            name: attr.alias
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
        if (p.kind === "value" || p.type === "lookupId") {
          attrs.push({ name: p.logicalName, alias: key });
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
        this._attributes.push({ name: fieldDef.logicalName, alias });
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
          const fieldName = value.field ? value.field.toString() : this._table.primaryKey.property.logicalName;
          const operation = value.operation === "average" ? "avg" : value.operation;
          initialAttributes.push({ name: fieldName, alias, aggregate: operation });
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
            `Table "${this._table.entitySetName}" is not related to intersect table "${intersectTable.name}"`
          );
        }
        const targetBuilder = new EntityQueryBuilder(targetTable, this._linkAlias);
        subqueryFn(targetBuilder);
        const pkName = this._table.primaryKey.property.logicalName;
        const targetPkName = targetTable.primaryKey.property.logicalName;
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
        const fromFieldName = table.fields[from].logicalName;
        const toFieldName = this._table.fields[to].logicalName;
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
        const fromFieldName = table.fields[from].logicalName;
        const toFieldName = this._table.fields[to].logicalName;
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
        const recordId = v[this._table.primaryKey.property.fromDataverseName] ?? v[this._table.primaryKey.property.logicalName] ?? "";
        const ctx = { table: this._table, client: this._table.client, recordId };
        for (const [alias, info] of aliasInfo) {
          if (info.name in v) {
            result[alias] = info.field ? info.field.transformFromDataverse(v[info.name], ctx) : v[info.name];
          } else {
            result[alias] = info.getDefault();
          }
        }
        result[ETAG] = v["@odata.etag"];
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
          ([_, f]) => (f.fromDataverseName ?? f.logicalName) === attr.name
        );
        if (entry) {
          const fieldDef = entry[1];
          const dataverseName = fieldDef.fromDataverseName ?? fieldDef.logicalName;
          map.set(attr.alias, {
            field: FieldRef.fromPath(fieldDef, dataverseName),
            getDefault: () => fieldDef.getDefault?.(),
            name: attr.alias
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

  const defaults = {
    entitySetName: "nnsyc200_test_tables",
    logicalName: "nnsyc200_test_table",
    collectionNav: "nnsyc200_test_table_Test_Lookup_nnsyc200_test_table",
    altKeyAttribute: "nnsyc200_alt_key",
    globalOptionSet: "nnsyc200_test_choice"
  };
  const paramMap = {
    entity: "entitySetName",
    logical: "logicalName",
    nav: "collectionNav",
    altkey: "altKeyAttribute",
    optionset: "globalOptionSet"
  };
  function loadConfig() {
    const params = new URLSearchParams(location.search);
    const overrides = {};
    for (const [param, key] of Object.entries(paramMap)) {
      const value = params.get(param);
      if (value) overrides[key] = value;
    }
    return { ...defaults, ...window.__DV_TEST_CONFIG__ ?? {}, ...overrides };
  }

  function buildTables(client, cfg) {
    const baseFields = {
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
      statusCode: choice("statuscode", { 1: "Active", 2: "Inactive" }),
      choice: choice("nnsyc200_choice", { 1: "A", 2: "B", 3: "C" }, { default: "B" }),
      multiChoice: multiChoice("nnsyc200_choice_month", Array.from({ length: 12 }, (_, i) => i + 1)),
      image: image("nnsyc200_image"),
      altKey: string("nnsyc200_Alt_Key"),
      name: string("nnsyc200_name")
    };
    const TestTable0 = new DataverseTable({
      logicalName: cfg.logicalName,
      entitySetName: cfg.entitySetName,
      client,
      fields: {
        ...baseFields,
        // Thunk targets are cast to the loose shape so the two mutually
        // referenced tables don't create an inference cycle.
        children: collection(cfg.collectionNav, () => TestTable)
      }
    });
    const TestTable = new DataverseTable({
      logicalName: cfg.logicalName,
      entitySetName: cfg.entitySetName,
      client,
      fields: {
        ...baseFields,
        testLookup: lookupId("nnsyc200_Test_Lookup", () => TestTable0),
        testLookupNav: lookup("nnsyc200_Test_Lookup", () => TestTable0),
        children: collection(cfg.collectionNav, () => TestTable0)
      }
    });
    return { client, TestTable0, TestTable };
  }

  class FixtureTracker {
    sessionPrefix = `dvt${Date.now().toString(36)}`;
    runIndex = 0;
    tag = "";
    counters = {};
    ids = [];
    beginRun() {
      this.runIndex++;
      this.ids.length = 0;
    }
    beginSuite(tag) {
      this.tag = tag;
      this.counters = {};
    }
    /** Prefix that uniquely identifies the CURRENT suite's data (used by scoped filters). */
    get scopePrefix() {
      return `${this.sessionPrefix}-r${this.runIndex}-${this.tag}`;
    }
    track(id) {
      if (!id) throw new Error("track() called without an id");
      this.ids.push(id);
      return id;
    }
    name(kind) {
      const n = (this.counters[kind] ?? 0) + 1;
      this.counters[kind] = n;
      return `${this.scopePrefix}-${kind}-${n}`;
    }
  }
  function pngBlob() {
    const b64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";
    const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    return new Blob([bytes], { type: "image/png" });
  }
  async function deleteByIds(table, ids) {
    let deleted = 0;
    for (const id of ids) {
      try {
        await table.deleteRecord(id);
        deleted++;
      } catch {
      }
    }
    return deleted;
  }
  async function sweepOrphans(table) {
    try {
      const rows = await table.getRecords({ filter: "startswith(nnsyc200_name,'dvt')" });
      const ids = rows.map((r) => r.id).filter((id) => !!id);
      return await deleteByIds(table, ids);
    } catch {
      return -1;
    }
  }

  class SkipError extends Error {
    constructor(reason) {
      super(reason);
      this.name = "SkipError";
    }
  }
  function assert(cond, msg) {
    if (!cond) throw new Error(`Assertion failed: ${msg}`);
  }
  function assertEquals(actual, expected, label = "value") {
    const a = JSON.stringify(actual);
    const e = JSON.stringify(expected);
    if (a !== e) {
      throw new Error(`Assertion failed: ${label}
  expected: ${e}
  actual:   ${a}`);
    }
  }
  function assertInstanceOf(value, ctor, label = "value") {
    if (!(value instanceof ctor)) {
      throw new Error(`Assertion failed: ${label} expected instance of ${ctor.name}, got ${String(value)}`);
    }
  }
  async function assertRejects(fn, fragment) {
    let threw;
    let didThrow = false;
    try {
      await fn();
    } catch (e) {
      didThrow = true;
      threw = e;
    }
    if (!didThrow) throw new Error(`Assertion failed: expected promise to reject${fragment ? ` with "${fragment}"` : ""}`);
    if (fragment) {
      const message = threw instanceof Error ? threw.message : JSON.stringify(threw);
      if (!message.includes(fragment)) {
        throw new Error(`Assertion failed: expected rejection containing "${fragment}", got "${message}"`);
      }
    }
    return threw;
  }

  class Runner {
    constructor(base) {
      this.base = base;
    }
    async run(suites, events = {}) {
      const results = [];
      const startedAt = (/* @__PURE__ */ new Date()).toISOString();
      this.base.fx.beginRun();
      for (const suite of suites) {
        events.onSuiteStart?.(suite);
        this.base.fx.beginSuite(suite.name);
        const ctx = { ...this.base, state: {} };
        let setupError;
        const cases = (() => {
          try {
            return suite.tests(ctx);
          } catch (e) {
            setupError = e;
            return [];
          }
        })();
        if (!setupError && suite.setup) {
          try {
            await suite.setup(ctx);
          } catch (e) {
            setupError = e;
          }
        }
        for (const test of cases) {
          events.onTestStart?.(suite, test);
          const started = performance.now();
          let result;
          if (setupError) {
            result = {
              suite: suite.name,
              suiteTitle: suite.title,
              name: test.name,
              status: "skip",
              durationMs: 0,
              error: `suite setup failed: ${messageOf$1(setupError)}`
            };
          } else {
            try {
              await test.fn(ctx);
              result = { suite: suite.name, suiteTitle: suite.title, name: test.name, status: "pass", durationMs: performance.now() - started };
            } catch (e) {
              const status = e instanceof SkipError ? "skip" : "fail";
              result = {
                suite: suite.name,
                suiteTitle: suite.title,
                name: test.name,
                status,
                durationMs: performance.now() - started,
                error: status === "fail" ? `${messageOf$1(e)}
${stackOf(e)}` : messageOf$1(e)
              };
            }
          }
          results.push(result);
          events.onTestEnd?.(result);
        }
      }
      const cleanedUp = await deleteByIds(this.base.tables.TestTable, this.base.fx.ids);
      const summary = {
        results,
        passed: results.filter((r) => r.status === "pass").length,
        failed: results.filter((r) => r.status === "fail").length,
        skipped: results.filter((r) => r.status === "skip").length,
        cleanedUp,
        startedAt,
        finishedAt: (/* @__PURE__ */ new Date()).toISOString()
      };
      this.base.fx.ids.length = 0;
      events.onFinish?.(summary);
      return summary;
    }
  }
  function messageOf$1(e) {
    if (e instanceof Error) return e.message;
    try {
      return JSON.stringify(e);
    } catch {
      return String(e);
    }
  }
  function stackOf(e) {
    return e instanceof Error && e.stack ? e.stack.split("\n").slice(1, 4).join("\n") : "";
  }

  const CSS = `
.dvt-root { font: 13px/1.5 monospace; background:#111; color:#ddd; padding:16px; margin:8px; border-radius:8px; }
.dvt-root h1 { font-size:15px; margin:0 0 4px; color:#fff; }
.dvt-meta { color:#888; margin-bottom:10px; white-space:pre-wrap; }
.dvt-controls { display:flex; flex-wrap:wrap; gap:8px; align-items:center; margin-bottom:10px; }
.dvt-controls label { cursor:pointer; user-select:none; }
.dvt-button { background:#2d6cdf; color:#fff; border:0; padding:6px 14px; border-radius:5px; cursor:pointer; font:inherit; }
.dvt-button.secondary { background:#444; }
.dvt-button:disabled { opacity:.5; cursor:default; }
.dvt-status { min-height:18px; color:#ffd479; margin-bottom:8px; white-space:pre-wrap; }
.dvt-suite { margin-bottom:12px; }
.dvt-suite-title { font-weight:bold; color:#fff; margin:6px 0; }
.dvt-test { padding:1px 0 1px 14px; }
.dvt-test.fail { color:#ff7b72; cursor:pointer; }
.dvt-test.skip { color:#d29922; }
.dvt-pass { color:#3fb950; }
.dvt-error { display:none; white-space:pre-wrap; color:#ff7b72; background:#1c1316; padding:6px 8px; margin:4px 0; border-left:3px solid #ff7b72; }
.dvt-summary { margin-top:12px; color:#fff; white-space:pre-wrap; }
`;
  class Reporter {
    constructor(runner, suites, ctxMeta) {
      this.runner = runner;
      this.suites = suites;
      this.ctxMeta = ctxMeta;
    }
    root;
    statusEl;
    resultsEl;
    summaryEl;
    runButton;
    checkboxes = /* @__PURE__ */ new Map();
    lastSummary = null;
    mount(parent) {
      const style = document.createElement("style");
      style.textContent = CSS;
      document.head.append(style);
      this.root = document.createElement("div");
      this.root.className = "dvt-root";
      const title = document.createElement("h1");
      title.textContent = "dataverse-schema browser tests";
      this.root.append(title);
      this.statusEl = document.createElement("div");
      this.statusEl.className = "dvt-status";
      this.summaryEl = document.createElement("div");
      this.summaryEl.className = "dvt-summary";
      this.resultsEl = document.createElement("div");
      const controls = document.createElement("div");
      controls.className = "dvt-controls";
      this.runButton = document.createElement("button");
      this.runButton.className = "dvt-button";
      this.runButton.textContent = "Run selected";
      this.runButton.onclick = () => void this.runSelected();
      controls.append(this.runButton);
      const all = document.createElement("button");
      all.className = "dvt-button secondary";
      all.textContent = "All / none";
      all.onclick = () => {
        const anyOn = [...this.checkboxes.values()].some((c) => c.checked);
        for (const c of this.checkboxes.values()) c.checked = !anyOn;
      };
      controls.append(all);
      const sweep = document.createElement("button");
      sweep.className = "dvt-button secondary";
      sweep.textContent = "Sweep orphaned test data";
      sweep.onclick = () => void this.sweep();
      controls.append(sweep);
      for (const suite of this.suites) {
        const label = document.createElement("label");
        const box = document.createElement("input");
        box.type = "checkbox";
        box.checked = true;
        this.checkboxes.set(suite.name, box);
        label.append(box, ` ${suite.title} `);
        controls.append(label);
      }
      const meta = document.createElement("div");
      meta.className = "dvt-meta";
      meta.textContent = `build ${"2026-08-24T13:39:12.904Z"}
org ${this.ctxMeta.orgUrl}
data stem ${this.ctxMeta.dataStem} (auto-swept before each run)`;
      const copyJson = document.createElement("button");
      copyJson.className = "dvt-button secondary";
      copyJson.textContent = "Copy JSON results";
      copyJson.onclick = () => void this.copy(this.exportJson());
      const copyMd = document.createElement("button");
      copyMd.className = "dvt-button secondary";
      copyMd.textContent = "Copy Markdown results";
      copyMd.onclick = () => void this.copy(this.exportMarkdown());
      controls.append(copyJson, copyMd);
      this.root.append(meta, controls, this.statusEl, this.resultsEl, this.summaryEl);
      parent.append(this.root);
      window.addEventListener("error", (e) => this.log(`window error: ${e.error ?? e.message}`));
      window.addEventListener("unhandledrejection", (e) => this.log(`unhandled rejection: ${String(e.reason)}`));
    }
    async runSelected() {
      const selected = this.suites.filter((s) => this.checkboxes.get(s.name)?.checked);
      if (selected.length === 0) return;
      this.runButton.disabled = true;
      this.resultsEl.replaceChildren();
      this.summaryEl.textContent = "";
      this.log("sweeping stale dvt* records from earlier runs…");
      const swept = await this.ctxMeta.sweep();
      if (swept > 0) this.log(`swept ${swept} stale record(s)`);
      await this.runner.run(selected, {
        onSuiteStart: (suite) => {
          this.log(`running suite "${suite.title}"…`);
        },
        onTestStart: (_suite, test) => {
          this.log(`▶ ${test.name}`);
        },
        onTestEnd: (result) => {
          this.renderResult(result);
          this.log("");
        },
        onFinish: (summary) => {
          this.lastSummary = summary;
          this.renderSummary(summary);
          this.log(`done — cleaned up ${summary.cleanedUp}/${summary.results.length + summary.cleanedUp} tracked records`);
        }
      });
      this.runButton.disabled = false;
    }
    renderResult(result) {
      let suiteBlock = this.resultsEl.querySelector(`[data-suite="${result.suite}"]`);
      if (!suiteBlock) {
        suiteBlock = document.createElement("div");
        suiteBlock.className = "dvt-suite";
        suiteBlock.dataset.suite = result.suite;
        const heading = document.createElement("div");
        heading.className = "dvt-suite-title";
        heading.textContent = result.suiteTitle;
        suiteBlock.append(heading);
        this.resultsEl.append(suiteBlock);
      }
      const row = document.createElement("div");
      row.className = `dvt-test ${result.status}`;
      const glyph = result.status === "pass" ? "✓" : result.status === "skip" ? "–" : "✗";
      row.innerHTML = `<span class="dvt-${result.status === "pass" ? "pass" : result.status}">${glyph}</span> ${escapeHtml(result.name)} <span style="color:#666">(${result.durationMs.toFixed(0)}ms)</span>`;
      if (result.status !== "pass" && result.error) {
        const details = document.createElement("div");
        details.className = "dvt-error";
        details.textContent = result.error;
        row.title = result.status === "skip" ? result.error : "click to toggle error";
        if (result.status === "fail") {
          row.onclick = () => {
            details.style.display = details.style.display === "block" ? "none" : "block";
          };
        } else {
          details.style.display = "block";
        }
        row.append(details);
      }
      suiteBlock.append(row);
    }
    renderSummary(summary) {
      const total = summary.passed + summary.failed + summary.skipped;
      this.summaryEl.textContent = `complete: ${summary.passed}/${total} passed` + (summary.failed ? `, ${summary.failed} FAILED` : "") + (summary.skipped ? `, ${summary.skipped} skipped` : "") + `
tracked records deleted after run: ${summary.cleanedUp}`;
    }
    log(message) {
      this.statusEl.textContent = message;
    }
    exportJson() {
      const s = this.lastSummary;
      return JSON.stringify(
        {
          build: "2026-08-24T13:39:12.904Z",
          org: this.ctxMeta.orgUrl,
          startedAt: s?.startedAt,
          finishedAt: s?.finishedAt,
          passed: s?.passed ?? 0,
          failed: s?.failed ?? 0,
          skipped: s?.skipped ?? 0,
          results: s?.results.map(({ suite, name, status, durationMs, error }) => ({ suite, name, status, durationMs: Math.round(durationMs), error }))
        },
        null,
        2
      );
    }
    exportMarkdown() {
      const s = this.lastSummary;
      if (!s) return "";
      const lines = [
        "# Browser test results",
        "",
        `Build: \`${"2026-08-24T13:39:12.904Z"}\``,
        `Org: ${this.ctxMeta.orgUrl}`,
        `Run window: ${s.startedAt} → ${s.finishedAt}`,
        ""
      ];
      let currentSuite = "";
      for (const r of s.results) {
        if (r.suiteTitle !== currentSuite) {
          currentSuite = r.suiteTitle;
          lines.push(`## ${currentSuite}`, "");
        }
        const glyph = r.status === "pass" ? "✅" : r.status === "skip" ? "⏭️" : "❌";
        lines.push(`- ${glyph} **${r.name}** (${Math.round(r.durationMs)}ms)`);
        if (r.error) {
          const body = r.error.split("\n").map((l) => `  > ${l}`).join("\n");
          lines.push(body);
        }
      }
      lines.push("", `**${s.passed} passed, ${s.failed} failed, ${s.skipped} skipped**`);
      return lines.join("\n");
    }
    async copy(text) {
      try {
        await navigator.clipboard.writeText(text);
        this.log("copied to clipboard");
      } catch {
        const area = document.createElement("textarea");
        area.value = text;
        document.body.append(area);
        area.select();
        document.execCommand("copy");
        area.remove();
        this.log("copied to clipboard (fallback)");
      }
    }
    async sweep() {
      this.log("sweeping orphaned dvt* records…");
      const n = await this.ctxMeta.sweep();
      this.log(n >= 0 ? `swept ${n} orphaned record(s)` : "sweep query failed");
    }
  }
  function escapeHtml(s) {
    return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }

  async function seedRow(ctx, overrides = {}) {
    const id = await ctx.tables.TestTable.createRecord({
      name: ctx.fx.name("row"),
      ...overrides
    });
    return ctx.fx.track(id);
  }
  async function seedParent(ctx, overrides = {}) {
    const id = await ctx.tables.TestTable0.createRecord({
      name: ctx.fx.name("parent"),
      ...overrides
    });
    return ctx.fx.track(id);
  }

  const GUID_RE$1 = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const generalSuite = {
    name: "general",
    title: "General smoke",
    async setup(ctx) {
      ctx.state.parentName = ctx.fx.name("parent");
      ctx.state.parent = await seedParent(ctx, { name: ctx.state.parentName, int: 100, bool: true, text: "parent" });
      ctx.state.childName = ctx.fx.name("child");
      ctx.state.child = await seedRow(ctx, {
        name: ctx.state.childName,
        int: 5,
        bool: true,
        text: "child",
        datetime: /* @__PURE__ */ new Date("2024-01-15T10:30:00Z"),
        dateOnly: /* @__PURE__ */ new Date("2024-01-15T00:00:00Z"),
        testLookup: ctx.state.parent,
        choice: "B"
      });
    },
    tests: (ctx) => [
      {
        name: "WhoAmI returns a userId",
        fn: async () => {
          const r = await WhoAmI(ctx.client);
          assert(r && r.UserId && GUID_RE$1.test(r.UserId), "valid UserId missing from WhoAmI response");
        }
      },
      {
        name: "createRecord returns well-formed GUIDs",
        fn: () => {
          assert(GUID_RE$1.test(ctx.state.parent), `bad parent id ${ctx.state.parent}`);
          assert(GUID_RE$1.test(ctx.state.child), `bad child id ${ctx.state.child}`);
        }
      },
      {
        name: "getRecords filter/orderby/top (OData, transformed)",
        fn: async () => {
          const rows = await ctx.tables.TestTable.getRecords({
            filter: `nnsyc200_int gt 0 and startswith(nnsyc200_name,'${ctx.fx.scopePrefix}')`,
            orderby: "nnsyc200_name asc",
            top: 10
          });
          const child = rows.find((r) => r.id === ctx.state.child);
          assert(child, "seeded child not returned by query");
          assertEquals(child.testLookup, ctx.state.parent, "lookupId value persisted");
          assert(typeof child.int === "number" && typeof child.name === "string", "row transforms applied");
        }
      },
      {
        name: "fetchOdata query string works against the API",
        fn: async () => {
          const q = fetchOdata(ctx.tables.TestTable).select("name", "int").filter("nnsyc200_int gt 0").toString();
          const rows = await ctx.client.getRecords(ctx.tables.TestTable.entitySetName, { query: q });
          assert(Array.isArray(rows) && rows.length >= 1, "expected odata rows");
        }
      },
      {
        name: "fetchXml query string works against the API",
        fn: async () => {
          const fx = fetchXml(ctx.tables.TestTable).select((f) => ({ name: f.name, int: f.int })).filter("nnsyc200_int gt 0").top(10).toString();
          const rows = await ctx.client.getRecords(ctx.tables.TestTable.entitySetName, { query: fx });
          assert(Array.isArray(rows) && rows.length >= 1, "expected fetchxml rows");
        }
      },
      {
        name: "fetchOdata FilterExpr operators + row transforms",
        fn: async () => {
          const rows = await fetchOdata(ctx.tables.TestTable).select("name", "int", "bool", "datetime").filter((f) => and(gt(f.int, 0), lt(f.int, 1e3))).orderby((f) => f.name, "asc").top(10).execute();
          assert(Array.isArray(rows) && rows.length >= 1, "expected odata rows");
          const r = rows[0];
          assert(typeof r.int === "number", `int not transformed: ${JSON.stringify(r.int)}`);
          assert(typeof r.bool === "boolean", `bool not transformed: ${JSON.stringify(r.bool)}`);
          assert(typeof r.name === "string", `name not transformed: ${JSON.stringify(r.name)}`);
          assert(r.datetime instanceof Date, `datetime not transformed: ${JSON.stringify(r.datetime)}`);
        }
      },
      {
        name: "fetchOdata expand lookup navigation + nested transforms",
        fn: async () => {
          const rows = await fetchOdata(ctx.tables.TestTable).select("name").expand("testLookupNav", (q) => q.select("name", "createdOn", "int")).filter(`nnsyc200_test_tableid eq ${ctx.state.child}`).execute();
          assert(rows.length === 1, "expected exactly the child row");
          const nav = rows[0].testLookupNav;
          assert(nav && nav.name === ctx.state.parentName, `expand failed: ${JSON.stringify(nav)}`);
          assert(nav.createdOn instanceof Date, "related createdOn not transformed to Date");
          assert(typeof nav.int === "number", "related int not transformed");
        }
      },
      {
        name: "fetchXml FilterExpr (and/eq) + transforms",
        fn: async () => {
          const rows = await fetchXml(ctx.tables.TestTable).select((f) => ({ name: f.name, int: f.int, bool: f.bool, datetime: f.datetime })).filter((f) => and(eq(f.name, ctx.state.childName), gt(f.int, 0))).execute();
          assert(rows.length >= 1, "expected fetchxml rows");
          const r = rows[0];
          assertEquals(r.int, 5, "int value/transform");
          assert(typeof r.bool === "boolean", "bool transform");
          assert(r.datetime instanceof Date, "datetime transform");
        }
      },
      {
        name: "fetchXml join (link-entity) to parent",
        fn: async () => {
          const base = fetchXml(ctx.tables.TestTable).select((f) => ({ name: f.name, datetime: f.datetime, int: f.int })).join("inner", ctx.tables.TestTable0, "id", "testLookup", (sub) => sub.select((f) => ({ parentName: f.name }))).filter((f) => eq(f.id, ctx.state.child));
          const raw = await ctx.client.getRecords(ctx.tables.TestTable.entitySetName, { query: base.toString() });
          assert(Array.isArray(raw) && raw.length === 1, "expected the child row via join");
          assertEquals(raw[0].parentName, ctx.state.parentName, "joined alias column present in raw payload");
          const transformed = await base.execute();
          assert(transformed[0].datetime instanceof Date, "main-entity transforms on joined query");
        }
      },
      {
        name: "fetchXml aggregate (count + sum)",
        fn: async () => {
          const fx = fetchXml(ctx.tables.TestTable).apply((f) => ({ n: count(f.id), totalInt: sum(f.int) })).toString();
          const rows = await ctx.client.getRecords(ctx.tables.TestTable.entitySetName, { query: fx });
          assert(Array.isArray(rows) && rows.length === 1, "expected one aggregate row");
          assert(rows[0].n !== void 0 && rows[0].totalInt !== void 0, `aggregate aliases missing: ${JSON.stringify(rows[0])}`);
        }
      },
      {
        name: "getPropertyValue reads a value column",
        fn: async () => {
          const v = await ctx.tables.TestTable.getPropertyValue("text", ctx.state.child);
          assertEquals(v, "child", "text property value");
        }
      },
      {
        name: "updatePropertyValue writes and reads back",
        fn: async () => {
          await ctx.tables.TestTable.updatePropertyValue("text", ctx.state.child, "child-updated");
          const v = await ctx.tables.TestTable.getPropertyValue("text", ctx.state.child);
          assertEquals(v, "child-updated", "updated text");
        }
      },
      {
        name: "deletePropertyValue clears a value",
        fn: async () => {
          await ctx.tables.TestTable.deletePropertyValue("text", ctx.state.child);
          const v = await ctx.tables.TestTable.getPropertyValue("text", ctx.state.child);
          assert(v == null || v === "", `expected cleared value, got ${JSON.stringify(v)}`);
        }
      },
      {
        name: "updateRecord persists changes",
        fn: async () => {
          await ctx.tables.TestTable.updateRecord(ctx.state.child, { int: 42 });
          const rows = await ctx.tables.TestTable.getRecords({ filter: `nnsyc200_test_tableid eq ${ctx.state.child}` });
          assert(rows[0] && rows[0].int === 42, "updateRecord int not persisted");
        }
      },
      {
        name: "upsertRecord update path persists",
        fn: async () => {
          await ctx.tables.TestTable.upsertRecord(ctx.state.child, { text: "upserted" });
          const v = await ctx.tables.TestTable.getPropertyValue("text", ctx.state.child);
          assertEquals(v, "upserted", "upserted text");
        }
      },
      {
        name: "file + image upload via afterSave (updateRecord)",
        fn: async () => {
          await ctx.tables.TestTable.updateRecord(ctx.state.child, {
            file: { name: "smoke.txt", data: new Blob(["hello file"]) },
            image: { data: pngBlobBytes() }
          });
        }
      },
      {
        name: "file + image upload via afterSave (createRecord)",
        fn: async () => {
          const id = await ctx.tables.TestTable.createRecord({
            name: ctx.fx.name("child2"),
            int: 7,
            text: "child2",
            testLookup: ctx.state.parent,
            file: { name: "smoke2.txt", data: new Blob(["hello2"]) },
            image: { data: pngBlobBytes() }
          });
          ctx.fx.track(id);
        }
      },
      {
        name: "multiChoice round-trips CSV through property APIs",
        fn: async () => {
          await ctx.tables.TestTable.updatePropertyValue("multiChoice", ctx.state.child, [3, 4, 5]);
          const raw = await ctx.client.getRecords(ctx.tables.TestTable.entitySetName, {
            query: `$select=nnsyc200_choice_month&$filter=nnsyc200_test_tableid eq ${ctx.state.child}`
          });
          assertEquals(raw[0]?.nnsyc200_choice_month, "3,4,5", "raw multi-choice payload is CSV");
          const v = await ctx.tables.TestTable.getPropertyValue("multiChoice", ctx.state.child);
          assertEquals(v, [3, 4, 5], "multiChoice transforms to number[]");
        }
      }
    ]
  };
  function pngBlobBytes() {
    const b64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";
    return new Blob([Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))], { type: "image/png" });
  }

  const crudSuite = {
    name: "crud",
    title: "CRUD & concurrency",
    async setup(ctx) {
      ctx.state.row = await seedRow(ctx, { int: 10, text: "crud-row", choice: "B" });
    },
    tests: (ctx) => [
      {
        name: "getRecord transforms all field kinds",
        fn: async () => {
          const r = await ctx.tables.TestTable.getRecord(ctx.state.row);
          assert(r, "record not found");
          assertEquals(r.id, ctx.state.row, "primary key");
          assertEquals(r.int, 10, "int");
          assertEquals(r.bool, false, "bool default false");
          assertEquals(r.choice, "B", "choice label");
          assertEquals(r.statusCode, "Active", "statusCode label");
          assert(r.createdOn instanceof Date, "createdOn is Date");
          assertEquals(r.multiChoice, [], "multiChoice reads as empty array");
        }
      },
      {
        name: "readonly formula column is skipped on update",
        fn: async () => {
          await ctx.tables.TestTable.updateRecord(ctx.state.row, { formula: "SHOULD_NOT_APPLY", int: 99 });
          const r = await ctx.tables.TestTable.getRecord(ctx.state.row);
          assert(r, "row missing after update");
          assertEquals(r.int, 99, "writable int applied");
          assert(r.formula !== "SHOULD_NOT_APPLY", `readonly formula must not be written, got ${JSON.stringify(r.formula)}`);
        }
      },
      {
        name: "upsertRecord create path creates a new record",
        fn: async () => {
          const id = await ctx.tables.TestTable.upsertRecord(void 0, {
            name: ctx.fx.name("upsert-create"),
            int: 11
          });
          ctx.fx.track(id);
          const r = await ctx.tables.TestTable.getRecord(id);
          assertEquals(r?.int, 11, "created via upsert");
        }
      },
      {
        name: "pickProperties table queries a subset",
        fn: async () => {
          const NameOnly = ctx.tables.TestTable.pickProperties("name", "int", "id");
          const rows = await NameOnly.getRecords({ filter: `nnsyc200_test_tableid eq ${ctx.state.row}` });
          assert(rows.length === 1, "subset query returned row");
          const keys = Object.keys(rows[0]).sort();
          assertEquals(keys, ["$etag", "id", "int", "name"], "only picked fields present");
        }
      },
      {
        name: "activateRecord / deactivateRecord round-trip statecode",
        fn: async () => {
          await ctx.tables.TestTable.deactivateRecord(ctx.state.row);
          let r = await ctx.tables.TestTable.getRecord(ctx.state.row);
          assertEquals(r?.stateCode, 1, "deactivated");
          await ctx.tables.TestTable.activateRecord(ctx.state.row);
          r = await ctx.tables.TestTable.getRecord(ctx.state.row);
          assertEquals(r?.stateCode, 0, "reactivated");
        }
      },
      {
        name: "deleteRecord removes the record",
        fn: async () => {
          const id = await seedRow(ctx, { int: 12 });
          try {
            await ctx.tables.TestTable.deleteRecord(id);
          } catch (e) {
            const msg = e instanceof Error ? e.message : JSON.stringify(e);
            if (!msg.includes("404")) throw e;
          }
          const r = await ctx.tables.TestTable.getRecord(id);
          assertEquals(r, null, "deleted record is gone");
        }
      },
      {
        name: "alternate key lookup resolves the created record",
        fn: async () => {
          if (!ctx.cfg.altKeyAttribute) throw new Error("skip: set altKeyAttribute in config");
          const unique = ctx.fx.name("altkey");
          const created = await seedRow(ctx, { altKey: unique });
          const found = await ctx.tables.TestTable.getRecord(`${ctx.cfg.altKeyAttribute}='${unique}'`);
          assert(found, "record not found via alternate key");
          assertEquals(found.id, created, "alternate key resolves to the created record");
        }
      }
    ]
  };

  const odataSuite = {
    name: "query-odata",
    title: "OData builder end-to-end",
    async setup(ctx) {
      ctx.state.parent = await seedRow(ctx, { int: 100, choice: "A", bool: true });
      const seeds = [
        ["c1", 5, "A", true],
        ["c2", 7, "C", true],
        ["c3", 42, "B", true],
        ["c4", 1, "A", false]
      ];
      ctx.state.seeds = [];
      for (const [kind, int, choice, linked] of seeds) {
        const id = await seedRow(ctx, {
          name: ctx.fx.name(kind),
          int,
          choice,
          ...linked ? { testLookup: ctx.state.parent } : {}
        });
        ctx.state.seeds.push({ id, kind, int, choice });
      }
    },
    tests: (ctx) => {
      const allIds = [ctx.state.parent, ...ctx.state.seeds.map((s) => s.id)];
      const scope = `startswith(nnsyc200_name,'${ctx.fx.scopePrefix}')`;
      return [
        {
          name: "select narrows the row shape",
          fn: async () => {
            const rows = await fetchOdata(ctx.tables.TestTable).select("name", "int").filter(scope).execute();
            assertEquals(rows.length, 5, "seeded row count");
            for (const r of rows) assertEquals(Object.keys(r).sort(), ["$etag", "int", "name"], "narrowed keys");
          }
        },
        {
          name: "statusCode choice label filters to numeric option value",
          fn: async () => {
            const rows = await fetchOdata(ctx.tables.TestTable).select("id").filter((f) => eq(f.statusCode, "Active")).filter(scope).execute();
            assertEquals(rows.length, 5, "all seeded rows are Active");
            for (const id of allIds) assert(rows.some((r) => r.id === id), `missing ${id}`);
          }
        },
        {
          name: "custom choice column filters by label",
          fn: async () => {
            const expected = ctx.state.seeds.filter((s) => s.choice === "C").map((s) => s.id);
            const rows = await fetchOdata(ctx.tables.TestTable).select("id").filter((f) => eq(f.choice, "C")).execute();
            assertEquals(rows.map((r) => r.id).sort(), [...expected].sort(), "choice C rows");
          }
        },
        {
          name: "contains / startsWith string functions",
          fn: async () => {
            const contained = await fetchOdata(ctx.tables.TestTable).select("id").filter((f) => contains(f.name, ctx.fx.scopePrefix)).execute();
            assertEquals(contained.length, 5, "all rows contain run prefix");
            const prefixed = await fetchOdata(ctx.tables.TestTable).select("id").filter((f) => contains(f.name, `${ctx.fx.scopePrefix}-c1`)).execute();
            assertEquals(prefixed.length, 1, "startsWith narrows to c1");
          }
        },
        {
          name: "comparison operators gt/ge/lt/le windows",
          fn: async () => {
            const rows = await fetchOdata(ctx.tables.TestTable).select("int").filter(scope).filter((f) => and(gt(f.int, 6), lt(f.int, 50))).execute();
            const ints = rows.map((r) => r.int);
            assertEquals(ints.sort((a, b) => a - b), [7, 42], `windowed ints (raw ${JSON.stringify(rows.map((r) => r.int))})`);
          }
        },
        {
          name: "and / or / not composition",
          fn: async () => {
            const rows = await fetchOdata(ctx.tables.TestTable).select("int", "choice").filter(scope).filter((f) => and(or(eq(f.int, 5), eq(f.int, 42)), not(eq(f.choice, "B")))).execute();
            const composedInts = rows.map((r) => r.int);
            assertEquals(composedInts.sort((a, b) => a - b), [5, 42], `composed filter ints (raw ${JSON.stringify(rows.map((r) => r.int))})`);
            assertEquals(rows.every((r) => r.choice !== "B"), true, "not(B) respected");
          }
        },
        {
          name: "orderby desc + top",
          fn: async () => {
            const rows = await fetchOdata(ctx.tables.TestTable).select("int").filter(scope).orderby((f) => f.int, "desc").top(4).execute();
            assertEquals(rows.map((r) => r.int), [100, 42, 7, 5], "descending order");
          }
        },
        {
          name: "iteratePages follows nextLink pagination (pageSize 2)",
          fn: async () => {
            const seen = /* @__PURE__ */ new Set();
            for await (const page of ctx.tables.TestTable.iteratePages({ filter: scope }, { pageSize: 2 })) {
              for (const r of page) seen.add(r.id);
            }
            assertEquals(seen.size, 5, `paged through all seeded rows`);
            for (const id of allIds) assert(seen.has(id), `row ${id} missing from pagination`);
          }
        },
        {
          name: "any/all lambdas discriminate parents from childless rows",
          fn: async () => {
            const withBigChild = await fetchOdata(ctx.tables.TestTable).select("id").filter(scope).filter((f) => any(f.children, (c) => gt(c.int, 6))).execute();
            assertEquals(withBigChild.map((r) => r.id), [ctx.state.parent], "only parent has a child with int > 6");
            const allSmallChildren = await fetchOdata(ctx.tables.TestTable).select("id").filter(scope).filter((f) => all(f.children, (c) => lt(c.int, 40))).execute();
            const smallIds = [...allIds].filter((id) => id !== ctx.state.parent);
            assertEquals([...allSmallChildren].map((r) => r.id).sort(), smallIds.sort(), "vacuous all() matches childless rows; parent excluded (child int 42)");
          }
        },
        {
          name: "expand collection children with sub-select",
          fn: async () => {
            const rows = await fetchOdata(ctx.tables.TestTable0).select("name").expand("children", (sub) => sub.select("name", "int")).filter(`nnsyc200_test_tableid eq ${ctx.state.parent}`).execute();
            assert(rows.length === 1, "parent row returned");
            const kids = rows[0].children ?? [];
            assertEquals(kids.length, 3, "three children under parent");
            for (const k of kids) {
              assert(typeof k.int === "number", "child int transformed");
              assert(typeof k.name === "string", "child name transformed");
            }
          }
        },
        {
          name: "apply groupby(choice) with count/sum/min/max/average",
          fn: async () => {
            const rows = await fetchOdata(ctx.tables.TestTable).apply((f) => ({
              byChoice: groupby(f.choice),
              n: count(),
              totalInt: sum(f.int),
              lo: min(f.int),
              hi: max(f.int),
              avg: average(f.int)
            })).filter(scope).execute();
            const byChoice = new Map(rows.map((r) => [r.byChoice, r]));
            assertEquals(byChoice.size, 3, "groups A/B/C");
            const a = byChoice.get("A");
            assertEquals(a.n, 3, "group A count");
            assertEquals(a.totalInt, 106, "group A sum 100+5+1");
            assertEquals(a.lo, 1, "group A min");
            assertEquals(a.hi, 100, "group A max");
            assert(Math.abs(a.avg - 106 / 3) < 0.01, `group A average, got ${a.avg}`);
            assertEquals(byChoice.get("B").totalInt, 42, "group B sum");
            assertEquals(byChoice.get("C").totalInt, 7, "group C sum");
          }
        },
        {
          name: "count() aggregate matches seed count",
          fn: async () => {
            const rows = await fetchOdata(ctx.tables.TestTable).apply((f) => ({ n: count() })).filter(scope).execute();
            assertEquals(rows.length, 1, "single aggregate row");
            assertEquals(rows[0].n, 5, "total count");
          }
        }
      ];
    }
  };

  const fetchxmlSuite = {
    name: "query-fetchxml",
    title: "FetchXML builder end-to-end",
    async setup(ctx) {
      ctx.state.lonelyName = ctx.fx.name("lonely");
      ctx.state.parentName = ctx.fx.name("parent");
      ctx.state.kidBase = `${ctx.fx.scopePrefix}-kid`;
      ctx.state.lonelyParent = await seedParent(ctx, { name: ctx.state.lonelyName, int: 0, text: "fx-parent" });
      ctx.state.parent = await seedParent(ctx, { name: ctx.state.parentName, int: 100, choice: "A", text: "fx-parent" });
      const seeds = [
        ["c1", 5, "A"],
        ["c2", 7, "C"],
        ["c3", 42, "B"]
      ];
      ctx.state.seeds = [];
      for (const [kind, int, choice] of seeds) {
        const id = await seedRow(ctx, {
          name: `${ctx.fx.scopePrefix}-${kind}`,
          int,
          choice,
          testLookup: ctx.state.parent
        });
        ctx.state.seeds.push({ id, kind, int, choice });
      }
    },
    tests: (ctx) => {
      const scopePrefix = ctx.fx.scopePrefix;
      const scoped = (f) => startsWith(f.name, scopePrefix);
      return [
        {
          name: "select with aliases + execute applies transforms",
          fn: async () => {
            const rows = await fetchXml(ctx.tables.TestTable).select((f) => ({ label: f.name, amount: f.int })).filter(scoped).top(10).execute();
            assertEquals(rows.length, 5, "prefixed rows (3 children + 2 parents)");
            for (const r of rows) {
              assert(typeof r.label === "string", "aliased name transformed");
              assert(typeof r.amount === "number", "aliased int transformed");
            }
          }
        },
        {
          name: "distinct collapses duplicate values",
          fn: async () => {
            const rows = await fetchXml(ctx.tables.TestTable).select((f) => ({ c: f.choice })).filter(scoped).distinct().execute();
            const labels = new Set(rows.map((r) => r.c));
            assertEquals(labels.size, rows.length, "no duplicates returned");
            for (const want of ["A", "B", "C"]) assert(labels.has(want), `missing choice ${want}`);
          }
        },
        {
          name: "inner join to parent exposes aliased columns",
          fn: async () => {
            const rows = await fetchXml(ctx.tables.TestTable).select((f) => ({ childName: f.name })).join("inner", ctx.tables.TestTable0, "id", "testLookup", (sub) => sub.select((f) => ({ parentLabel: f.name }))).filter((f) => eq(f.id, ctx.state.seeds[0].id)).execute();
            assertEquals(rows.length, 1, "one joined row");
            assertEquals(rows[0].parentLabel, ctx.state.parentName, "parent alias resolved");
          }
        },
        {
          name: "outer join keeps parents without children; inner drops them",
          fn: async () => {
            const base = (linkType) => fetchXml(ctx.tables.TestTable0).select((f) => ({ parentName: f.name })).join(linkType, ctx.tables.TestTable, "testLookup", "id", (sub) => sub.select((f) => ({ kid: f.name }))).filter(scoped).filter((f) => eq(f.text, "fx-parent")).execute();
            const outer = await base("outer");
            assertEquals(outer.length, 4, "lonely parent once + populated parent per child (join multiplies)");
            const outerNames = new Set(outer.map((r) => r.parentName));
            assertEquals([...outerNames].sort(), [ctx.state.lonelyName, ctx.state.parentName].sort(), "both parents present via outer join");
            const inner = await base("inner");
            assertEquals(inner.length, 3, "populated parent repeated per child");
            assertEquals(inner.every((r) => r.parentName === ctx.state.parentName), true, "inner join hit the right parent");
          }
        },
        {
          name: "filter-only exists join",
          fn: async () => {
            const rows = await fetchXml(ctx.tables.TestTable0).select((f) => ({ parentName: f.name })).join(
              "exists",
              ctx.tables.TestTable,
              "testLookup",
              "id",
              (sub) => sub.filter((f) => gt(f.int, 6))
            ).filter(scoped).execute();
            assertEquals(rows.length, 1, "only parent with a big-int child");
          }
        },
        {
          name: "aggregate groupby(choice) + sum + count via execute()",
          fn: async () => {
            const rows = await fetchXml(ctx.tables.TestTable).apply((f) => ({ byChoice: groupby(f.choice), totalInt: sum(f.int), n: count(f.id) })).filter(scoped).execute();
            const byChoice = new Map(rows.map((r) => [r.byChoice, r]));
            assertEquals(byChoice.size, 3, "groups A/B/C");
            const a = byChoice.get("A");
            assertEquals(a.totalInt, 105, "group A sum 100+5");
            assertEquals(a.n, 2, "group A count");
            assertEquals(byChoice.get("B").totalInt, 42, "group B sum");
            assertEquals(byChoice.get("C").totalInt, 7, "group C sum");
          }
        },
        {
          name: "aggregate min/max/average aliases",
          fn: async () => {
            const rows = await fetchXml(ctx.tables.TestTable).apply((f) => ({ lo: min(f.int), hi: max(f.int), avg: average(f.int), n: count() })).filter(scoped).execute();
            assertEquals(rows.length, 1, "single aggregate row");
            const r = rows[0];
            assertEquals(r.lo, 0, "min includes lonely parent");
            assertEquals(r.hi, 100, "max");
            assertEquals(r.n, 5, "count all prefixed rows");
            assert(Math.abs(r.avg - 30) < 0.51, `average ~30 (Dataverse truncates int avg), got ${r.avg}`);
          }
        },
        {
          name: "orderby desc + top on aliased select",
          fn: async () => {
            const rows = await fetchXml(ctx.tables.TestTable).select((f) => ({ amount: f.int })).filter(scoped).orderby((f) => f.int, "desc").top(3).execute();
            assertEquals(rows.map((r) => r.amount), [100, 42, 7], "descending ints");
          }
        },
        {
          name: "typed FilterExpr composites narrow rows",
          fn: async () => {
            const rows = await fetchXml(ctx.tables.TestTable).select((f) => ({ id: f.id, int: f.int })).filter(scoped).filter((f) => and(gt(f.int, 6), lt(f.int, 50))).execute();
            const ints = rows.map((r) => r.int);
            assertEquals(ints.sort((a, b) => a - b), [7, 42], `windowed ints (raw ${JSON.stringify(rows.map((r) => r.int))})`);
          }
        }
      ];
    }
  };

  const navigationSuite = {
    name: "navigation",
    title: "Navigation properties",
    async setup(ctx) {
      ctx.state.parentName = ctx.fx.name("nav-parent");
      ctx.state.parent = await seedParent(ctx, { name: ctx.state.parentName, int: 100 });
      ctx.state.kid1 = await seedRow(ctx, { int: 5, testLookup: ctx.state.parent });
      ctx.state.kid2 = await seedRow(ctx, { int: 7, testLookup: ctx.state.parent });
      ctx.state.detached = await seedRow(ctx, { int: 9 });
    },
    tests: (ctx) => [
      {
        name: "expanded children collection returns linked rows",
        fn: async () => {
          const rows = await fetchOdata(ctx.tables.TestTable0).select("name").expand("children", (sub) => sub.select("name")).filter(`nnsyc200_test_tableid eq ${ctx.state.parent}`).execute();
          assertEquals(rows[0].children?.length, 2, "two linked kids");
        }
      },
      {
        name: "getPropertyValue supports lookupId and lookup navigation",
        fn: async () => {
          const idValue = await ctx.tables.TestTable.getPropertyValue("testLookup", ctx.state.kid2);
          assertEquals(idValue, ctx.state.parent, "raw lookupId value");
          const nav = await ctx.tables.TestTable.getPropertyValue("testLookupNav", ctx.state.kid2);
          assert(nav && typeof nav === "object", "expanded lookup object returned");
          assertEquals(nav.name, ctx.state.parentName, "nav record transformed");
        }
      },
      {
        name: "getPropertyValue returns linked ids for collection navigation",
        fn: async () => {
          const kids = await ctx.tables.TestTable0.getPropertyValue("children", ctx.state.parent);
          assert(Array.isArray(kids), "array returned");
          assertEquals(kids.length, 2, "both kids listed");
        }
      },
      {
        name: "choice column round-trips label ↔ value",
        fn: async () => {
          await ctx.tables.TestTable.updateRecord(ctx.state.kid1, { choice: "C" });
          const kid = await ctx.tables.TestTable.getRecord(ctx.state.kid1);
          assertEquals(kid?.choice, "C", "choice persisted");
        }
      },
      {
        name: "associateRecord links a detached row through the lookup",
        fn: async () => {
          await ctx.tables.TestTable.associateRecord("testLookup", ctx.state.detached, ctx.state.parent);
          const kid = await ctx.tables.TestTable.getRecord(ctx.state.detached);
          assertEquals(kid?.testLookup, ctx.state.parent, "lookupId set by associate");
        }
      },
      {
        name: "dissociateRecord clears a collection link",
        fn: async () => {
          await ctx.tables.TestTable.dissociateRecord("children", ctx.state.parent, ctx.state.kid2);
          const rows = await fetchOdata(ctx.tables.TestTable0).select("id").expand("children", (sub) => sub.select("name")).filter(`nnsyc200_test_tableid eq ${ctx.state.parent}`).execute();
          assertEquals(rows[0].children?.length ?? 0, 2, "kid2 removed, detached still linked");
          await ctx.tables.TestTable.associateRecord("testLookup", ctx.state.kid2, ctx.state.parent);
        }
      },
      {
        name: "lookup navigation afterSave creates + associates a new related record",
        fn: async () => {
          const navName = ctx.fx.name("nav-created");
          await ctx.tables.TestTable.updateRecord(ctx.state.kid1, {
            text: "nav-created-target",
            testLookupNav: { name: navName }
          });
          const kid = await ctx.tables.TestTable.getRecord(ctx.state.kid1);
          assert(kid?.testLookup, "lookupId now points at the created record");
          if (kid.testLookup) ctx.fx.track(kid.testLookup);
          const target = await ctx.tables.TestTable.getRecord(kid.testLookup);
          assertEquals(target?.name, navName, "created record carries the given name");
        }
      },
      {
        name: "lookup navigation null clears the lookup",
        fn: async () => {
          await ctx.tables.TestTable.updateRecord(ctx.state.kid1, { text: "nav-clear", testLookupNav: null });
          const kid = await ctx.tables.TestTable.getRecord(ctx.state.kid1);
          assertEquals(kid?.testLookup, null, "lookup cleared");
        }
      }
    ]
  };

  const filesSuite = {
    name: "files-images",
    title: "File & image columns",
    async setup(ctx) {
      ctx.state.row = await seedRow(ctx, { int: 3 });
    },
    tests: (ctx) => [
      {
        name: "upload file + image via afterSave",
        fn: async () => {
          await ctx.tables.TestTable.updateRecord(ctx.state.row, {
            file: { name: "smoke.txt", data: new Blob(["hello file content"]) },
            image: { data: pngBlob() }
          });
        }
      },
      {
        name: "file reads back as FileRef with the uploaded name",
        fn: async () => {
          const r = await ctx.tables.TestTable.getRecord(ctx.state.row);
          assert(r, "row missing");
          assertEquals(r.file?.name ?? null, "smoke.txt", "uploaded filename");
        }
      },
      {
        name: "image reads back as ImageRef with a data URL",
        fn: async () => {
          const r = await ctx.tables.TestTable.getRecord(ctx.state.row);
          assert(r, "row missing");
          const img = r.image;
          assert(img && typeof img.url === "string", "image ref present");
          assert(String(img.url).startsWith("data:image/png;base64,"), `png data url, got ${String(img.url).slice(0, 40)}…`);
        }
      },
      {
        name: "raw file $value endpoint returns uploaded bytes",
        fn: async () => {
          const res = await ctx.client.getPropertyRawValue(ctx.tables.TestTable.entitySetName, ctx.state.row, "nnsyc200_file");
          assert(typeof res === "string" ? res === "hello file content" : res instanceof Response, "raw value responded");
          if (res instanceof Response) assertEquals(await res.text(), "hello file content", "round-tripped bytes");
        }
      },
      {
        name: "downloadImage returns a non-empty blob",
        fn: async () => {
          const blob = await ctx.tables.TestTable.downloadImage(ctx.state.row, "image");
          assert(blob.size > 0, `image blob empty (size ${blob.size})`);
        }
      },
      {
        name: "deleteFile / deleteImage clear the columns",
        fn: async () => {
          await ctx.tables.TestTable.deleteFile(ctx.state.row, "file");
          await ctx.tables.TestTable.deleteImage(ctx.state.row, "image");
          const r = await ctx.tables.TestTable.getRecord(ctx.state.row);
          assert(r, "row missing");
          assertEquals(r.file, null, "file cleared");
          assertEquals(r.image, null, "image cleared");
        }
      }
    ]
  };

  const GUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const functionsSuite = {
    name: "functions-actions",
    title: "Functions & actions",
    tests: (ctx) => [
      {
        name: "WhoAmI returns the three org ids",
        fn: async () => {
          const r = await WhoAmI(ctx.client);
          for (const key of ["BusinessUnitId", "UserId", "OrganizationId"]) {
            assert(GUID_RE.test(r[key]), `${key} is a GUID`);
          }
        }
      },
      {
        name: "RetrieveTotalRecordCount returns a number",
        fn: async () => {
          const n = await RetrieveTotalRecordCount(ctx.client, ctx.cfg.logicalName);
          assert(typeof n === "number" && n >= 0, `count was ${JSON.stringify(n)}`);
        }
      },
      {
        name: "unbound function RetrieveVersion via client.fetch",
        fn: async () => {
          const v = await ctx.client.fetch("RetrieveVersion()");
          assert(v && typeof v.Version === "string", `version missing: ${JSON.stringify(v)}`);
          assert(v.Version.split(".").length >= 2, `unexpected version format: ${v.Version}`);
        }
      },
      {
        name: "RetrieveChoices maps a global option set (config.globalOptionSet)",
        fn: async () => {
          if (!ctx.cfg.globalOptionSet) throw new Error("skip: set globalOptionSet in config to a global choice schema name");
          const choices = await RetrieveChoices(ctx.client, ctx.cfg.globalOptionSet);
          assert(Array.isArray(choices) && choices.length > 0, "choices returned");
          for (const c of choices.slice(0, 3)) {
            assert(typeof c.value === "number" && typeof c.label === "string", `bad choice mapping: ${JSON.stringify(c)}`);
          }
        }
      }
    ]
  };

  function messageOf(e) {
    return e instanceof Error ? e.message : JSON.stringify(e);
  }
  const BULK = 5;
  const bulkSuite = {
    name: "bulk",
    title: "Bulk operations",
    async setup(ctx) {
      ctx.state.rows = [];
      for (let i = 0; i < BULK; i++) {
        ctx.state.rows.push(await seedRow(ctx, { name: ctx.fx.name(`bulk-${i}`), int: i + 1 }));
      }
    },
    tests: (ctx) => {
      const scope = `startswith(nnsyc200_name,'${ctx.fx.scopePrefix}-bulk')`;
      return [
        {
          name: "seeded bulk rows are all present",
          fn: async () => {
            const rows = await ctx.tables.TestTable.getRecords({ filter: scope });
            assertEquals(rows.length, BULK, "row count");
          }
        },
        {
          name: "updateMultiple applies to every row",
          fn: async () => {
            await ctx.tables.TestTable.updateMultiple(
              ctx.state.rows.map((id) => ({ id, int: 555 }))
            );
            const rows = await ctx.tables.TestTable.getRecords({ filter: scope });
            for (const r of rows) assertEquals(r.int, 555, `bulk-updated int on ${r.id}`);
          }
        },
        {
          name: "count aggregate sees bulk rows before deleteMultiple",
          fn: async () => {
            const rows = await fetchOdata(ctx.tables.TestTable).apply((f) => ({ n: count() })).filter(scope).execute();
            assertEquals(rows[0]?.n, BULK, "aggregate count");
          }
        },
        {
          name: "deleteMultiple removes every row",
          fn: async () => {
            try {
              await ctx.tables.TestTable.deleteMultiple(ctx.state.rows);
            } catch (e) {
              const msg = messageOf(e);
              if (msg.includes("has not yet been implemented") || msg.includes("405")) {
                throw new Error("skip: this org has not enabled DeleteMultiple");
              }
              throw e;
            }
            const rows = await ctx.tables.TestTable.getRecords({ filter: scope });
            assertEquals(rows.length, 0, "all bulk rows deleted");
          }
        }
      ];
    }
  };

  const MISSING = "00000000-0000-0000-0000-00000000dead";
  const errorsSuite = {
    name: "errors",
    title: "Error handling",
    tests: (ctx) => [
      {
        name: "getRecord on a missing id returns null",
        fn: async () => {
          const r = await ctx.tables.TestTable.getRecord(MISSING);
          assertEquals(r, null, "missing record maps to null");
        }
      },
      {
        name: "deleteRecord on a missing id rejects with DataverseHttpError 404",
        fn: async () => {
          const err = await assertRejects(
            () => ctx.tables.TestTable.deleteRecord(MISSING)
          );
          assertInstanceOf(err, DataverseHttpError, "typed error");
          assertEquals(err.status, 404, "status code");
        }
      },
      {
        name: "invalid choice label throws client-side before any HTTP call",
        fn: async () => {
          await assertRejects(
            async () => {
              const id = await ctx.tables.TestTable.createRecord({ choice: "NOT_A_LABEL" });
              if (id) await ctx.tables.TestTable.deleteRecord(id);
            },
            "Unknown choice label"
          );
        }
      },
      {
        name: "stale ifMatch update rejects with 412 Precondition Failed",
        fn: async () => {
          const row = await seedRow(ctx, { int: 1 });
          try {
            const err = await assertRejects(
              () => ctx.tables.TestTable.updateRecord(row, { int: 2 }, { ifMatch: 'W/"999999"' })
            );
            assertEquals(err.status, 412, "precondition status");
          } finally {
            await ctx.tables.TestTable.deleteRecord(row).catch(() => void 0);
          }
        }
      },
      {
        name: "multiChoice write of an unknown value still round-trips numerically",
        fn: async () => {
          const row = await seedRow(ctx, {});
          try {
            await ctx.tables.TestTable.updatePropertyValue("multiChoice", row, [1, 12]);
            const v = await ctx.tables.TestTable.getPropertyValue("multiChoice", row);
            assertEquals(v, [1, 12], "boundary month values");
          } finally {
            await ctx.tables.TestTable.deleteRecord(row).catch(() => void 0);
          }
        }
      }
    ]
  };

  const suites = [
    generalSuite,
    crudSuite,
    odataSuite,
    fetchxmlSuite,
    navigationSuite,
    filesSuite,
    functionsSuite,
    bulkSuite,
    errorsSuite
  ];

  async function boot() {
    const cfg = loadConfig();
    const client = new DataverseClient();
    const tables = buildTables(client, cfg);
    const fx = new FixtureTracker();
    const runner = new Runner({ client, tables, cfg, fx });
    const reporter = new Reporter(runner, suites, {
      orgUrl: client.options.url ?? "unknown",
      dataStem: fx.sessionPrefix,
      sweep: () => sweepOrphans(tables.TestTable)
    });
    reporter.mount(document.body);
    const params = new URLSearchParams(location.search);
    if (params.get("autorun") === "1") void reporter.runSelected();
  }
  if (document.body) {
    void boot();
  } else {
    window.addEventListener("DOMContentLoaded", () => void boot(), { once: true });
  }

})();
