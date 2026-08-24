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
  function getEtag(v) {
    return v?.[ETAG];
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
      if (value == null) return this.getDefault();
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
      if (value == null) return this.getDefault();
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
              error: `suite setup failed: ${messageOf(setupError)}`
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
                error: status === "fail" ? `${messageOf(e)}
${stackOf(e)}` : messageOf(e)
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
  function messageOf(e) {
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
      meta.textContent = `build ${"2026-08-24T16:30:52.513Z"}
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
          build: "2026-08-24T16:30:52.513Z",
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
        `Build: \`${"2026-08-24T16:30:52.513Z"}\``,
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

  class BaseExpression {
  }
  class PropRef extends BaseExpression {
    constructor(path) {
      super();
      this.path = path;
      this.type = `ref`;
    }
  }
  class Value extends BaseExpression {
    constructor(value) {
      super();
      this.value = value;
      this.type = `val`;
    }
  }
  class Func extends BaseExpression {
    constructor(name, args) {
      super();
      this.name = name;
      this.args = args;
      this.type = `func`;
    }
  }

  function safeRandomUUID() {
    const c = typeof globalThis !== `undefined` ? globalThis.crypto : void 0;
    if (c && typeof c.randomUUID === `function`) {
      return c.randomUUID();
    }
    if (c && typeof c.getRandomValues === `function`) {
      const bytes = c.getRandomValues(new Uint8Array(16));
      bytes[6] = bytes[6] & 15 | 64;
      bytes[8] = bytes[8] & 63 | 128;
      const hex = [];
      for (let i = 0; i < 16; i++) {
        hex.push(bytes[i].toString(16).padStart(2, `0`));
      }
      return hex.slice(0, 4).join(``) + `-` + hex.slice(4, 6).join(``) + `-` + hex.slice(6, 8).join(``) + `-` + hex.slice(8, 10).join(``) + `-` + hex.slice(10, 16).join(``);
    }
    throw new Error(
      `No secure random number generator available: neither crypto.randomUUID nor crypto.getRandomValues is defined in this environment.`
    );
  }

  class TanStackDBError extends Error {
    constructor(message) {
      super(message);
      this.name = `TanStackDBError`;
    }
  }
  class SchemaValidationError extends TanStackDBError {
    constructor(type, issues, message) {
      const defaultMessage = `${type === `insert` ? `Insert` : `Update`} validation failed: ${issues.map((issue) => `
- ${issue.message} - path: ${issue.path}`).join(``)}`;
      super(message || defaultMessage);
      this.name = `SchemaValidationError`;
      this.type = type;
      this.issues = issues;
    }
  }
  class CollectionConfigurationError extends TanStackDBError {
    constructor(message) {
      super(message);
      this.name = `CollectionConfigurationError`;
    }
  }
  class CollectionRequiresConfigError extends CollectionConfigurationError {
    constructor() {
      super(`Collection requires a config`);
    }
  }
  class CollectionRequiresSyncConfigError extends CollectionConfigurationError {
    constructor() {
      super(`Collection requires a sync config`);
    }
  }
  class InvalidSchemaError extends CollectionConfigurationError {
    constructor() {
      super(`Schema must implement the standard-schema interface`);
    }
  }
  class SchemaMustBeSynchronousError extends CollectionConfigurationError {
    constructor() {
      super(`Schema validation must be synchronous`);
    }
  }
  class CollectionStateError extends TanStackDBError {
    constructor(message) {
      super(message);
      this.name = `CollectionStateError`;
    }
  }
  class CollectionInErrorStateError extends CollectionStateError {
    constructor(operation, collectionId) {
      super(
        `Cannot perform ${operation} on collection "${collectionId}" - collection is in error state. Try calling cleanup() and restarting the collection.`
      );
    }
  }
  class InvalidCollectionStatusTransitionError extends CollectionStateError {
    constructor(from, to, collectionId) {
      super(
        `Invalid collection status transition from "${from}" to "${to}" for collection "${collectionId}"`
      );
    }
  }
  class CollectionIsInErrorStateError extends CollectionStateError {
    constructor() {
      super(`Collection is in error state`);
    }
  }
  class NegativeActiveSubscribersError extends CollectionStateError {
    constructor() {
      super(`Active subscribers count is negative - this should never happen`);
    }
  }
  class CollectionOperationError extends TanStackDBError {
    constructor(message) {
      super(message);
      this.name = `CollectionOperationError`;
    }
  }
  class UndefinedKeyError extends CollectionOperationError {
    constructor(item) {
      super(
        `An object was created without a defined key: ${JSON.stringify(item)}`
      );
    }
  }
  class InvalidKeyError extends CollectionOperationError {
    constructor(key, item) {
      const keyType = key === null ? `null` : typeof key;
      super(
        `getKey returned an invalid key type. Expected string or number, but got ${keyType}: ${JSON.stringify(key)}. Item: ${JSON.stringify(item)}`
      );
    }
  }
  class DuplicateKeyError extends CollectionOperationError {
    constructor(key) {
      super(
        `Cannot insert document with ID "${key}" because it already exists in the collection`
      );
    }
  }
  class DuplicateKeySyncError extends CollectionOperationError {
    constructor(key, collectionId, options) {
      const baseMessage = `Cannot insert document with key "${key}" from sync because it already exists in the collection "${collectionId}"`;
      if (options?.hasCustomGetKey && options.hasDistinct) {
        super(
          `${baseMessage}. This collection uses a custom getKey with .distinct(). The .distinct() operator deduplicates by the ENTIRE selected object (standard SQL behavior), but your custom getKey extracts only a subset of fields. This causes multiple distinct rows (with different values in non-key fields) to receive the same key. To fix this, either: (1) ensure your SELECT only includes fields that uniquely identify each row, (2) use .groupBy() with min()/max() aggregates to select one value per group, or (3) remove the custom getKey to use the default key behavior.`
        );
      } else if (options?.hasCustomGetKey && options.hasJoins) {
        super(
          `${baseMessage}. This collection uses a custom getKey with joined queries. Joined queries can produce multiple rows with the same key when relationships are not 1:1. Consider: (1) using a composite key in your getKey function (e.g., \`\${item.key1}-\${item.key2}\`), (2) ensuring your join produces unique rows per key, or (3) removing the custom getKey to use the default composite key behavior.`
        );
      } else {
        super(baseMessage);
      }
    }
  }
  class MissingUpdateArgumentError extends CollectionOperationError {
    constructor() {
      super(`The first argument to update is missing`);
    }
  }
  class NoKeysPassedToUpdateError extends CollectionOperationError {
    constructor() {
      super(`No keys were passed to update`);
    }
  }
  class UpdateKeyNotFoundError extends CollectionOperationError {
    constructor(key) {
      super(
        `The key "${key}" was passed to update but an object for this key was not found in the collection`
      );
    }
  }
  class KeyUpdateNotAllowedError extends CollectionOperationError {
    constructor(originalKey, newKey) {
      super(
        `Updating the key of an item is not allowed. Original key: "${originalKey}", Attempted new key: "${newKey}". Please delete the old item and create a new one if a key change is necessary.`
      );
    }
  }
  class NoKeysPassedToDeleteError extends CollectionOperationError {
    constructor() {
      super(`No keys were passed to delete`);
    }
  }
  class DeleteKeyNotFoundError extends CollectionOperationError {
    constructor(key) {
      super(
        `Collection.delete was called with key '${key}' but there is no item in the collection with this key`
      );
    }
  }
  class MissingHandlerError extends TanStackDBError {
    constructor(message) {
      super(message);
      this.name = `MissingHandlerError`;
    }
  }
  class MissingInsertHandlerError extends MissingHandlerError {
    constructor() {
      super(
        `Collection.insert called directly (not within an explicit transaction) but no 'onInsert' handler is configured.`
      );
    }
  }
  class MissingUpdateHandlerError extends MissingHandlerError {
    constructor() {
      super(
        `Collection.update called directly (not within an explicit transaction) but no 'onUpdate' handler is configured.`
      );
    }
  }
  class MissingDeleteHandlerError extends MissingHandlerError {
    constructor() {
      super(
        `Collection.delete called directly (not within an explicit transaction) but no 'onDelete' handler is configured.`
      );
    }
  }
  class TransactionError extends TanStackDBError {
    constructor(message) {
      super(message);
      this.name = `TransactionError`;
    }
  }
  class MissingMutationFunctionError extends TransactionError {
    constructor() {
      super(`mutationFn is required when creating a transaction`);
    }
  }
  class TransactionNotPendingMutateError extends TransactionError {
    constructor() {
      super(
        `You can no longer call .mutate() as the transaction is no longer pending`
      );
    }
  }
  class TransactionAlreadyCompletedRollbackError extends TransactionError {
    constructor() {
      super(
        `You can no longer call .rollback() as the transaction is already completed`
      );
    }
  }
  class TransactionNotPendingCommitError extends TransactionError {
    constructor() {
      super(
        `You can no longer call .commit() as the transaction is no longer pending`
      );
    }
  }
  class NoPendingSyncTransactionWriteError extends TransactionError {
    constructor() {
      super(`No pending sync transaction to write to`);
    }
  }
  class SyncTransactionAlreadyCommittedWriteError extends TransactionError {
    constructor() {
      super(
        `The pending sync transaction is already committed, you can't still write to it.`
      );
    }
  }
  class NoPendingSyncTransactionCommitError extends TransactionError {
    constructor() {
      super(`No pending sync transaction to commit`);
    }
  }
  class SyncTransactionAlreadyCommittedError extends TransactionError {
    constructor() {
      super(
        `The pending sync transaction is already committed, you can't commit it again.`
      );
    }
  }
  class QueryCompilationError extends TanStackDBError {
    constructor(message) {
      super(message);
      this.name = `QueryCompilationError`;
    }
  }
  class UnknownExpressionTypeError extends QueryCompilationError {
    constructor(type) {
      super(`Unknown expression type: ${type}`);
    }
  }
  class EmptyReferencePathError extends QueryCompilationError {
    constructor() {
      super(`Reference path cannot be empty`);
    }
  }
  class UnknownFunctionError extends QueryCompilationError {
    constructor(functionName) {
      super(`Unknown function: ${functionName}`);
    }
  }
  class SyncCleanupError extends TanStackDBError {
    constructor(collectionId, error) {
      const message = error instanceof Error ? error.message : String(error);
      super(
        `Collection "${collectionId}" sync cleanup function threw an error: ${message}`
      );
      this.name = `SyncCleanupError`;
    }
  }

  function deepEquals(a, b) {
    return deepEqualsInternal(a, b, /* @__PURE__ */ new Map());
  }
  function deepEqualsInternal(a, b, visited) {
    if (a === b) return true;
    if (a == null || b == null) return false;
    if (typeof a !== typeof b) return false;
    if (a instanceof Date) {
      if (!(b instanceof Date)) return false;
      return a.getTime() === b.getTime();
    }
    if (b instanceof Date) return false;
    if (a instanceof RegExp) {
      if (!(b instanceof RegExp)) return false;
      return a.source === b.source && a.flags === b.flags;
    }
    if (b instanceof RegExp) return false;
    if (a instanceof Map) {
      if (!(b instanceof Map)) return false;
      if (a.size !== b.size) return false;
      if (visited.has(a)) {
        return visited.get(a) === b;
      }
      visited.set(a, b);
      const entries = Array.from(a.entries());
      const result = entries.every(([key, val]) => {
        return b.has(key) && deepEqualsInternal(val, b.get(key), visited);
      });
      visited.delete(a);
      return result;
    }
    if (b instanceof Map) return false;
    if (a instanceof Set) {
      if (!(b instanceof Set)) return false;
      if (a.size !== b.size) return false;
      if (visited.has(a)) {
        return visited.get(a) === b;
      }
      visited.set(a, b);
      const aValues = Array.from(a);
      const bValues = Array.from(b);
      if (aValues.every((val) => typeof val !== `object`)) {
        visited.delete(a);
        return aValues.every((val) => b.has(val));
      }
      const result = aValues.length === bValues.length;
      visited.delete(a);
      return result;
    }
    if (b instanceof Set) return false;
    if (ArrayBuffer.isView(a) && ArrayBuffer.isView(b) && !(a instanceof DataView) && !(b instanceof DataView)) {
      const typedA = a;
      const typedB = b;
      if (typedA.length !== typedB.length) return false;
      for (let i = 0; i < typedA.length; i++) {
        if (typedA[i] !== typedB[i]) return false;
      }
      return true;
    }
    if (ArrayBuffer.isView(b) && !(b instanceof DataView) && !ArrayBuffer.isView(a)) {
      return false;
    }
    if (isTemporal(a) && isTemporal(b)) {
      const aTag = a[Symbol.toStringTag];
      const bTag = b[Symbol.toStringTag];
      if (aTag !== bTag) return false;
      if (typeof a.equals === `function`) {
        return a.equals(b);
      }
      return a.toString() === b.toString();
    }
    if (isTemporal(b)) return false;
    if (Array.isArray(a)) {
      if (!Array.isArray(b) || a.length !== b.length) return false;
      if (visited.has(a)) {
        return visited.get(a) === b;
      }
      visited.set(a, b);
      const result = a.every(
        (item, index) => deepEqualsInternal(item, b[index], visited)
      );
      visited.delete(a);
      return result;
    }
    if (Array.isArray(b)) return false;
    if (typeof a === `object`) {
      if (visited.has(a)) {
        return visited.get(a) === b;
      }
      visited.set(a, b);
      const keysA = Object.keys(a);
      const keysB = Object.keys(b);
      if (keysA.length !== keysB.length) {
        visited.delete(a);
        return false;
      }
      const result = keysA.every(
        (key) => key in b && deepEqualsInternal(a[key], b[key], visited)
      );
      visited.delete(a);
      return result;
    }
    return false;
  }
  const temporalTypes = /* @__PURE__ */ new Set([
    `Temporal.Duration`,
    `Temporal.Instant`,
    `Temporal.PlainDate`,
    `Temporal.PlainDateTime`,
    `Temporal.PlainMonthDay`,
    `Temporal.PlainTime`,
    `Temporal.PlainYearMonth`,
    `Temporal.ZonedDateTime`
  ]);
  function isTemporal(a) {
    if (a == null || typeof a !== `object`) return false;
    const tag = a[Symbol.toStringTag];
    return typeof tag === `string` && temporalTypes.has(tag);
  }
  const DEFAULT_COMPARE_OPTIONS = {
    direction: `asc`,
    nulls: `first`,
    stringSort: `locale`
  };

  const objectIds = /* @__PURE__ */ new WeakMap();
  let nextObjectId = 1;
  function getObjectId(obj) {
    if (objectIds.has(obj)) {
      return objectIds.get(obj);
    }
    const id = nextObjectId++;
    objectIds.set(obj, id);
    return id;
  }
  function isUnorderable(value) {
    return typeof value === `number` && Number.isNaN(value) || value instanceof Date && Number.isNaN(value.getTime());
  }
  const ascComparator = (a, b, opts) => {
    const { nulls } = opts;
    if (a == null && b == null) return 0;
    if (a == null) return nulls === `first` ? -1 : 1;
    if (b == null) return nulls === `first` ? 1 : -1;
    const aUnordered = isUnorderable(a);
    const bUnordered = isUnorderable(b);
    if (aUnordered && bUnordered) return 0;
    if (aUnordered) return 1;
    if (bUnordered) return -1;
    if (typeof a === `string` && typeof b === `string`) {
      if (opts.stringSort === `locale`) {
        return a.localeCompare(b, opts.locale, opts.localeOptions);
      }
    }
    if (Array.isArray(a) && Array.isArray(b)) {
      for (let i = 0; i < Math.min(a.length, b.length); i++) {
        const result = ascComparator(a[i], b[i], opts);
        if (result !== 0) {
          return result;
        }
      }
      return a.length - b.length;
    }
    if (a instanceof Date && b instanceof Date) {
      return a.getTime() - b.getTime();
    }
    if (isTemporal(a) && isTemporal(b)) {
      const aStr = a.toString();
      const bStr = b.toString();
      if (aStr < bStr) return -1;
      if (aStr > bStr) return 1;
      return 0;
    }
    const aIsObject = typeof a === `object`;
    const bIsObject = typeof b === `object`;
    if (aIsObject || bIsObject) {
      if (aIsObject && bIsObject) {
        const aId = getObjectId(a);
        const bId = getObjectId(b);
        return aId - bId;
      }
      if (aIsObject) return 1;
      if (bIsObject) return -1;
    }
    if (a < b) return -1;
    if (a > b) return 1;
    return 0;
  };
  const descComparator = (a, b, opts) => {
    return ascComparator(b, a, {
      ...opts,
      nulls: opts.nulls === `first` ? `last` : `first`
    });
  };
  function makeComparator(opts) {
    return (a, b) => {
      if (opts.direction === `asc`) {
        return ascComparator(a, b, opts);
      } else {
        return descComparator(a, b, opts);
      }
    };
  }
  function areUint8ArraysEqual(a, b) {
    if (a.byteLength !== b.byteLength) {
      return false;
    }
    for (let i = 0; i < a.byteLength; i++) {
      if (a[i] !== b[i]) {
        return false;
      }
    }
    return true;
  }
  const UINT8ARRAY_NORMALIZE_THRESHOLD = 128;
  function normalizeValue(value) {
    if (value instanceof Date) {
      return value.getTime();
    }
    if (isTemporal(value)) {
      return `__temporal__${value[Symbol.toStringTag]}__${value.toString()}`;
    }
    const isUint8Array = typeof Buffer !== `undefined` && value instanceof Buffer || value instanceof Uint8Array;
    if (isUint8Array) {
      if (value.byteLength <= UINT8ARRAY_NORMALIZE_THRESHOLD) {
        return `__u8__${Array.from(value).join(`,`)}`;
      }
    }
    return value;
  }
  function areValuesEqual(a, b) {
    if (a === b) {
      return true;
    }
    const aIsUint8Array = typeof Buffer !== `undefined` && a instanceof Buffer || a instanceof Uint8Array;
    const bIsUint8Array = typeof Buffer !== `undefined` && b instanceof Buffer || b instanceof Uint8Array;
    if (aIsUint8Array && bIsUint8Array) {
      return areUint8ArraysEqual(a, b);
    }
    return false;
  }

  function isUnknown(value) {
    return value === null || value === void 0;
  }
  function valuesEqual(a, b) {
    if (isUnorderable(a) || isUnorderable(b)) {
      return isUnorderable(a) && isUnorderable(b);
    }
    return areValuesEqual(a, b);
  }
  function toDateValue(value) {
    if (value instanceof Date) {
      return Number.isNaN(value.getTime()) ? null : value;
    }
    if (typeof value === `string` || typeof value === `number`) {
      const parsed = new Date(value);
      return Number.isNaN(parsed.getTime()) ? null : parsed;
    }
    return null;
  }
  function evaluateStrftime(format, date) {
    if (format === `%Y-%m-%d`) {
      return date.toISOString().slice(0, 10);
    }
    if (format === `%Y-%m-%dT%H:%M:%fZ`) {
      return date.toISOString();
    }
    return date.toISOString();
  }
  function toBooleanPredicate(result) {
    return result === true;
  }
  function compileExpression(expr, isSingleRow = false) {
    const compiledFn = compileExpressionInternal(expr, isSingleRow);
    return compiledFn;
  }
  function compileSingleRowExpression(expr) {
    const compiledFn = compileExpressionInternal(expr, true);
    return compiledFn;
  }
  function compileExpressionInternal(expr, isSingleRow) {
    switch (expr.type) {
      case `val`: {
        const value = expr.value;
        return () => value;
      }
      case `ref`: {
        return isSingleRow ? compileSingleRowRef(expr) : compileRef(expr);
      }
      case `func`: {
        return compileFunction(expr, isSingleRow);
      }
      default:
        throw new UnknownExpressionTypeError(expr.type);
    }
  }
  function compileRef(ref) {
    const [namespace, ...propertyPath] = ref.path;
    if (!namespace) {
      throw new EmptyReferencePathError();
    }
    if (namespace === `$selected`) {
      if (propertyPath.length === 0) {
        return (namespacedRow) => namespacedRow.$selected;
      } else if (propertyPath.length === 1) {
        const prop = propertyPath[0];
        return (namespacedRow) => {
          const selectResults = namespacedRow.$selected;
          return selectResults?.[prop];
        };
      } else {
        return (namespacedRow) => {
          const selectResults = namespacedRow.$selected;
          if (selectResults === void 0) {
            return void 0;
          }
          let value = selectResults;
          for (const prop of propertyPath) {
            if (value == null) {
              return value;
            }
            value = value[prop];
          }
          return value;
        };
      }
    }
    const tableAlias = namespace;
    if (propertyPath.length === 0) {
      return (namespacedRow) => namespacedRow[tableAlias];
    } else if (propertyPath.length === 1) {
      const prop = propertyPath[0];
      return (namespacedRow) => {
        const tableData = namespacedRow[tableAlias];
        return tableData?.[prop];
      };
    } else {
      return (namespacedRow) => {
        const tableData = namespacedRow[tableAlias];
        if (tableData === void 0) {
          return void 0;
        }
        let value = tableData;
        for (const prop of propertyPath) {
          if (value == null) {
            return value;
          }
          value = value[prop];
        }
        return value;
      };
    }
  }
  function compileSingleRowRef(ref) {
    const propertyPath = ref.path;
    return (item) => {
      let value = item;
      for (const prop of propertyPath) {
        if (value == null) {
          return value;
        }
        value = value[prop];
      }
      return value;
    };
  }
  function compileFunction(func, isSingleRow) {
    const compiledArgs = func.args.map(
      (arg) => compileExpressionInternal(arg, isSingleRow)
    );
    switch (func.name) {
      // Comparison operators
      case `eq`: {
        const argA = compiledArgs[0];
        const argB = compiledArgs[1];
        return (data) => {
          const a = normalizeValue(argA(data));
          const b = normalizeValue(argB(data));
          if (isUnknown(a) || isUnknown(b)) {
            return null;
          }
          return valuesEqual(a, b);
        };
      }
      case `gt`: {
        const argA = compiledArgs[0];
        const argB = compiledArgs[1];
        return (data) => {
          const a = argA(data);
          const b = argB(data);
          if (isUnknown(a) || isUnknown(b)) {
            return null;
          }
          if (isUnorderable(a) || isUnorderable(b)) {
            return isUnorderable(a) && !isUnorderable(b);
          }
          return a > b;
        };
      }
      case `gte`: {
        const argA = compiledArgs[0];
        const argB = compiledArgs[1];
        return (data) => {
          const a = argA(data);
          const b = argB(data);
          if (isUnknown(a) || isUnknown(b)) {
            return null;
          }
          if (isUnorderable(a) || isUnorderable(b)) {
            return isUnorderable(a);
          }
          return a >= b;
        };
      }
      case `lt`: {
        const argA = compiledArgs[0];
        const argB = compiledArgs[1];
        return (data) => {
          const a = argA(data);
          const b = argB(data);
          if (isUnknown(a) || isUnknown(b)) {
            return null;
          }
          if (isUnorderable(a) || isUnorderable(b)) {
            return isUnorderable(b) && !isUnorderable(a);
          }
          return a < b;
        };
      }
      case `lte`: {
        const argA = compiledArgs[0];
        const argB = compiledArgs[1];
        return (data) => {
          const a = argA(data);
          const b = argB(data);
          if (isUnknown(a) || isUnknown(b)) {
            return null;
          }
          if (isUnorderable(a) || isUnorderable(b)) {
            return isUnorderable(b);
          }
          return a <= b;
        };
      }
      // Boolean operators
      case `and`:
        return (data) => {
          let hasUnknown = false;
          for (const compiledArg of compiledArgs) {
            const result = compiledArg(data);
            if (result === false) {
              return false;
            }
            if (isUnknown(result)) {
              hasUnknown = true;
            }
          }
          if (hasUnknown) {
            return null;
          }
          return true;
        };
      case `or`:
        return (data) => {
          let hasUnknown = false;
          for (const compiledArg of compiledArgs) {
            const result = compiledArg(data);
            if (result === true) {
              return true;
            }
            if (isUnknown(result)) {
              hasUnknown = true;
            }
          }
          if (hasUnknown) {
            return null;
          }
          return false;
        };
      case `not`: {
        const arg = compiledArgs[0];
        return (data) => {
          const result = arg(data);
          if (isUnknown(result)) {
            return null;
          }
          return !result;
        };
      }
      // Array operators
      case `in`: {
        const valueEvaluator = compiledArgs[0];
        const arrayEvaluator = compiledArgs[1];
        return (data) => {
          const value = normalizeValue(valueEvaluator(data));
          const array = arrayEvaluator(data);
          if (isUnknown(value)) {
            return null;
          }
          if (!Array.isArray(array)) {
            return false;
          }
          return array.some((item) => valuesEqual(normalizeValue(item), value));
        };
      }
      // String operators
      case `like`: {
        const valueEvaluator = compiledArgs[0];
        const patternEvaluator = compiledArgs[1];
        return (data) => {
          const value = valueEvaluator(data);
          const pattern = patternEvaluator(data);
          if (isUnknown(value) || isUnknown(pattern)) {
            return null;
          }
          return evaluateLike(value, pattern, false);
        };
      }
      case `ilike`: {
        const valueEvaluator = compiledArgs[0];
        const patternEvaluator = compiledArgs[1];
        return (data) => {
          const value = valueEvaluator(data);
          const pattern = patternEvaluator(data);
          if (isUnknown(value) || isUnknown(pattern)) {
            return null;
          }
          return evaluateLike(value, pattern, true);
        };
      }
      // String functions
      case `upper`: {
        const arg = compiledArgs[0];
        return (data) => {
          const value = arg(data);
          return typeof value === `string` ? value.toUpperCase() : value;
        };
      }
      case `lower`: {
        const arg = compiledArgs[0];
        return (data) => {
          const value = arg(data);
          return typeof value === `string` ? value.toLowerCase() : value;
        };
      }
      case `length`: {
        const arg = compiledArgs[0];
        return (data) => {
          const value = arg(data);
          if (typeof value === `string`) {
            return value.length;
          }
          if (Array.isArray(value)) {
            return value.length;
          }
          return 0;
        };
      }
      case `concat`:
        return (data) => {
          return compiledArgs.map((evaluator) => {
            const arg = evaluator(data);
            try {
              return String(arg ?? ``);
            } catch {
              try {
                return JSON.stringify(arg) || ``;
              } catch {
                return `[object]`;
              }
            }
          }).join(``);
        };
      case `coalesce`:
        return (data) => {
          for (const evaluator of compiledArgs) {
            const value = evaluator(data);
            if (value !== null && value !== void 0) {
              return value;
            }
          }
          return null;
        };
      case `caseWhen`: {
        const hasDefaultValue = compiledArgs.length % 2 === 1;
        const pairCount = Math.floor(compiledArgs.length / 2);
        if (compiledArgs.length < 2) {
          throw new Error(`caseWhen() requires at least two arguments`);
        }
        return (data) => {
          for (let i = 0; i < pairCount; i++) {
            const condition = compiledArgs[i * 2];
            if (isCaseWhenConditionTrue(condition(data))) {
              const value = compiledArgs[i * 2 + 1];
              return value(data);
            }
          }
          if (hasDefaultValue) {
            return compiledArgs[compiledArgs.length - 1](data);
          }
          return null;
        };
      }
      // Math functions
      case `add`: {
        const argA = compiledArgs[0];
        const argB = compiledArgs[1];
        return (data) => {
          const a = argA(data);
          const b = argB(data);
          return (a ?? 0) + (b ?? 0);
        };
      }
      case `subtract`: {
        const argA = compiledArgs[0];
        const argB = compiledArgs[1];
        return (data) => {
          const a = argA(data);
          const b = argB(data);
          return (a ?? 0) - (b ?? 0);
        };
      }
      case `multiply`: {
        const argA = compiledArgs[0];
        const argB = compiledArgs[1];
        return (data) => {
          const a = argA(data);
          const b = argB(data);
          return (a ?? 0) * (b ?? 0);
        };
      }
      case `divide`: {
        const argA = compiledArgs[0];
        const argB = compiledArgs[1];
        return (data) => {
          const a = argA(data);
          const b = argB(data);
          const divisor = b ?? 0;
          return divisor !== 0 ? (a ?? 0) / divisor : null;
        };
      }
      case `date`: {
        const arg = compiledArgs[0];
        return (data) => {
          const value = arg(data);
          const dateValue = toDateValue(value);
          return dateValue ? dateValue.toISOString().slice(0, 10) : null;
        };
      }
      case `datetime`: {
        const arg = compiledArgs[0];
        return (data) => {
          const value = arg(data);
          const dateValue = toDateValue(value);
          return dateValue ? dateValue.toISOString() : null;
        };
      }
      case `strftime`: {
        const formatArg = compiledArgs[0];
        const sourceArg = compiledArgs[1];
        return (data) => {
          const format = formatArg(data);
          if (typeof format !== `string`) {
            return null;
          }
          const sourceValue = sourceArg(data);
          const dateValue = toDateValue(sourceValue);
          if (!dateValue) {
            return null;
          }
          return evaluateStrftime(format, dateValue);
        };
      }
      // Null/undefined checking functions
      case `isUndefined`: {
        const arg = compiledArgs[0];
        return (data) => {
          const value = arg(data);
          return value === void 0;
        };
      }
      case `isNull`: {
        const arg = compiledArgs[0];
        return (data) => {
          const value = arg(data);
          return value === null;
        };
      }
      default:
        throw new UnknownFunctionError(func.name);
    }
  }
  function isCaseWhenConditionTrue(value) {
    if (value == null || value === false) {
      return false;
    }
    if (value === true) {
      return true;
    }
    if (typeof value === `number`) {
      return value !== 0 && !Number.isNaN(value);
    }
    if (typeof value === `bigint`) {
      return value !== 0n;
    }
    return Boolean(value);
  }
  function evaluateLike(value, pattern, caseInsensitive) {
    if (typeof value !== `string` || typeof pattern !== `string`) {
      return false;
    }
    const searchValue = caseInsensitive ? value.toLowerCase() : value;
    const searchPattern = caseInsensitive ? pattern.toLowerCase() : pattern;
    let regexPattern = searchPattern.replace(/[.*+?^${}()|[\]\\]/g, `\\$&`);
    regexPattern = regexPattern.replace(/%/g, `.*`);
    regexPattern = regexPattern.replace(/_/g, `.`);
    const regex = new RegExp(`^${regexPattern}$`, "s");
    return regex.test(searchValue);
  }

  class ReverseIndex {
    constructor(index) {
      this.originalIndex = index;
    }
    // Define the reversed operations
    lookup(operation, value) {
      const reverseOperation = operation === `gt` ? `lt` : operation === `gte` ? `lte` : operation === `lt` ? `gt` : operation === `lte` ? `gte` : operation;
      return this.originalIndex.lookup(reverseOperation, value);
    }
    rangeQuery(options = {}) {
      return this.originalIndex.rangeQueryReversed(options);
    }
    rangeQueryReversed(options = {}) {
      return this.originalIndex.rangeQuery(options);
    }
    take(n, from, filterFn) {
      return this.originalIndex.takeReversed(n, from, filterFn);
    }
    takeFromStart(n, filterFn) {
      return this.originalIndex.takeReversedFromEnd(n, filterFn);
    }
    takeReversed(n, from, filterFn) {
      return this.originalIndex.take(n, from, filterFn);
    }
    takeReversedFromEnd(n, filterFn) {
      return this.originalIndex.takeFromStart(n, filterFn);
    }
    get orderedEntriesArray() {
      return this.originalIndex.orderedEntriesArrayReversed;
    }
    get orderedEntriesArrayReversed() {
      return this.originalIndex.orderedEntriesArray;
    }
    // All operations below delegate to the original index
    supports(operation) {
      return this.originalIndex.supports(operation);
    }
    get supportsRangeOptimization() {
      return this.originalIndex.supportsRangeOptimization;
    }
    matchesField(fieldPath) {
      return this.originalIndex.matchesField(fieldPath);
    }
    matchesCompareOptions(compareOptions) {
      return this.originalIndex.matchesCompareOptions(compareOptions);
    }
    matchesDirection(direction) {
      return this.originalIndex.matchesDirection(direction);
    }
    getStats() {
      return this.originalIndex.getStats();
    }
    add(key, item) {
      this.originalIndex.add(key, item);
    }
    remove(key, item) {
      this.originalIndex.remove(key, item);
    }
    update(key, oldItem, newItem) {
      this.originalIndex.update(key, oldItem, newItem);
    }
    build(entries) {
      this.originalIndex.build(entries);
    }
    clear() {
      this.originalIndex.clear();
    }
    get keyCount() {
      return this.originalIndex.keyCount;
    }
    equalityLookup(value) {
      return this.originalIndex.equalityLookup(value);
    }
    inArrayLookup(values) {
      return this.originalIndex.inArrayLookup(values);
    }
    get indexedKeysSet() {
      return this.originalIndex.indexedKeysSet;
    }
    get valueMapData() {
      return this.originalIndex.valueMapData;
    }
  }

  function enrichRowWithVirtualProps(row, key, collectionId, computeSynced, computeOrigin) {
    const existingRow = row;
    return {
      ...row,
      $synced: existingRow.$synced ?? computeSynced(),
      $origin: existingRow.$origin ?? computeOrigin(),
      $key: existingRow.$key ?? key,
      $collectionId: existingRow.$collectionId ?? collectionId
    };
  }
  const VIRTUAL_PROP_NAMES = [
    "$synced",
    "$origin",
    "$key",
    "$collectionId"
  ];
  function isVirtualPropName(name) {
    return VIRTUAL_PROP_NAMES.includes(name);
  }
  function hasVirtualPropPath(path) {
    return path.some((segment) => isVirtualPropName(segment));
  }

  function findIndexForField(collection, fieldPath, compareOptions) {
    if (hasVirtualPropPath(fieldPath)) {
      return void 0;
    }
    const compareOpts = compareOptions ?? {
      ...DEFAULT_COMPARE_OPTIONS,
      ...collection.compareOptions
    };
    for (const index of collection.indexes.values()) {
      if (index.matchesField(fieldPath) && index.matchesCompareOptions(compareOpts)) {
        if (!index.matchesDirection(compareOpts.direction)) {
          return new ReverseIndex(index);
        }
        return index;
      }
    }
    return void 0;
  }
  function intersectSets(sets) {
    if (sets.length === 0) return /* @__PURE__ */ new Set();
    if (sets.length === 1) return new Set(sets[0]);
    let result = new Set(sets[0]);
    for (let i = 1; i < sets.length; i++) {
      const newResult = /* @__PURE__ */ new Set();
      for (const item of result) {
        if (sets[i].has(item)) {
          newResult.add(item);
        }
      }
      result = newResult;
    }
    return result;
  }
  function unionSets(sets) {
    const result = /* @__PURE__ */ new Set();
    for (const set of sets) {
      for (const item of set) {
        result.add(item);
      }
    }
    return result;
  }
  function isExactComparisonValue(value) {
    return value != null;
  }
  function usesLocaleStringSort(collection) {
    const opts = { ...DEFAULT_COMPARE_OPTIONS, ...collection.compareOptions };
    return opts.stringSort === `locale`;
  }
  function isRangeOrderingDivergent(value, collection) {
    switch (typeof value) {
      case `number`:
      case `bigint`:
      case `boolean`:
        return false;
      case `string`:
        return usesLocaleStringSort(collection);
      case `object`: {
        if (value === null) return false;
        return !(value instanceof Date);
      }
      default:
        return false;
    }
  }
  function canRangeOptimize(value, index, collection) {
    return !isRangeOrderingDivergent(value, collection) && index.supportsRangeOptimization;
  }
  function optimizeExpressionWithIndexes(expression, collection) {
    return optimizeQueryRecursive(expression, collection);
  }
  function optimizeQueryRecursive(expression, collection) {
    if (expression.type === `func`) {
      switch (expression.name) {
        case `eq`:
        case `gt`:
        case `gte`:
        case `lt`:
        case `lte`:
          return optimizeSimpleComparison(expression, collection);
        case `and`:
          return optimizeAndExpression(expression, collection);
        case `or`:
          return optimizeOrExpression(expression, collection);
        case `in`:
          return optimizeInArrayExpression(expression, collection);
      }
    }
    return { canOptimize: false, matchingKeys: /* @__PURE__ */ new Set(), isExact: false };
  }
  function optimizeCompoundRangeQuery(expression, collection) {
    if (expression.type !== `func` || expression.args.length < 2) {
      return {
        canOptimize: false,
        matchingKeys: /* @__PURE__ */ new Set(),
        isExact: false,
        coveredArgIndices: /* @__PURE__ */ new Set()
      };
    }
    const fieldOperations = /* @__PURE__ */ new Map();
    for (const [argIndex, arg] of expression.args.entries()) {
      if (arg.type === `func` && [`gt`, `gte`, `lt`, `lte`].includes(arg.name)) {
        const rangeOp = arg;
        if (rangeOp.args.length === 2) {
          const leftArg = rangeOp.args[0];
          const rightArg = rangeOp.args[1];
          let fieldArg = null;
          let valueArg = null;
          let operation = rangeOp.name;
          if (leftArg.type === `ref` && rightArg.type === `val`) {
            fieldArg = leftArg;
            valueArg = rightArg;
          } else if (leftArg.type === `val` && rightArg.type === `ref`) {
            fieldArg = rightArg;
            valueArg = leftArg;
            switch (operation) {
              case `gt`:
                operation = `lt`;
                break;
              case `gte`:
                operation = `lte`;
                break;
              case `lt`:
                operation = `gt`;
                break;
              case `lte`:
                operation = `gte`;
                break;
            }
          }
          if (fieldArg && valueArg) {
            const fieldPath = fieldArg.path;
            const fieldKey = fieldPath.join(`.`);
            const value = valueArg.value;
            if (!fieldOperations.has(fieldKey)) {
              fieldOperations.set(fieldKey, []);
            }
            fieldOperations.get(fieldKey).push({ operation, value, argIndex });
          }
        }
      }
    }
    for (const [fieldKey, operations] of fieldOperations) {
      if (operations.length >= 2) {
        const fieldPath = fieldKey.split(`.`);
        const index = findIndexForField(collection, fieldPath);
        if (index && operations.some((op) => !canRangeOptimize(op.value, index, collection))) {
          continue;
        }
        if (index && index.supports(`gt`) && index.supports(`lt`)) {
          const compare = makeComparator({
            ...DEFAULT_COMPARE_OPTIONS,
            ...collection.compareOptions,
            direction: `asc`
          });
          let from = void 0;
          let to = void 0;
          let hasFromBound = false;
          let hasToBound = false;
          let fromInclusive = true;
          let toInclusive = true;
          let hasNonComparableBound = false;
          for (const { operation, value } of operations) {
            if (!isExactComparisonValue(value)) {
              hasNonComparableBound = true;
              continue;
            }
            switch (operation) {
              case `gt`:
              case `gte`: {
                const cmp = hasFromBound ? compare(value, from) : 1;
                if (cmp > 0) {
                  from = value;
                  hasFromBound = true;
                  fromInclusive = operation === `gte`;
                } else if (cmp === 0 && operation === `gt`) {
                  fromInclusive = false;
                }
                break;
              }
              case `lt`:
              case `lte`: {
                const cmp = hasToBound ? compare(value, to) : -1;
                if (cmp < 0) {
                  to = value;
                  hasToBound = true;
                  toInclusive = operation === `lte`;
                } else if (cmp === 0 && operation === `lt`) {
                  toInclusive = false;
                }
                break;
              }
            }
          }
          const rangeOptions = {};
          if (hasFromBound) {
            rangeOptions.from = from;
            rangeOptions.fromInclusive = fromInclusive;
          }
          if (hasToBound) {
            rangeOptions.to = to;
            rangeOptions.toInclusive = toInclusive;
          }
          const matchingKeys = index.rangeQuery(rangeOptions);
          return {
            canOptimize: true,
            matchingKeys,
            // The range result is exact only when it cannot include rows with a
            // nullish indexed value (which a comparison would reject but the
            // index returns, as they sort as the smallest key). That requires a
            // non-nullish lower bound to exclude them: without `hasFromBound`
            // the range is open at the bottom and captures those rows, and a
            // non-comparable bound value (`hasNonComparableBound`) can never
            // bound them out.
            isExact: hasFromBound && !hasNonComparableBound,
            coveredArgIndices: new Set(operations.map((op) => op.argIndex))
          };
        }
      }
    }
    return {
      canOptimize: false,
      matchingKeys: /* @__PURE__ */ new Set(),
      isExact: false,
      coveredArgIndices: /* @__PURE__ */ new Set()
    };
  }
  function optimizeSimpleComparison(expression, collection) {
    if (expression.type !== `func` || expression.args.length !== 2) {
      return { canOptimize: false, matchingKeys: /* @__PURE__ */ new Set(), isExact: false };
    }
    const leftArg = expression.args[0];
    const rightArg = expression.args[1];
    let fieldArg = null;
    let valueArg = null;
    let operation = expression.name;
    if (leftArg.type === `ref` && rightArg.type === `val`) {
      fieldArg = leftArg;
      valueArg = rightArg;
    } else if (leftArg.type === `val` && rightArg.type === `ref`) {
      fieldArg = rightArg;
      valueArg = leftArg;
      switch (operation) {
        case `gt`:
          operation = `lt`;
          break;
        case `gte`:
          operation = `lte`;
          break;
        case `lt`:
          operation = `gt`;
          break;
        case `lte`:
          operation = `gte`;
          break;
      }
    }
    if (fieldArg && valueArg) {
      const fieldPath = fieldArg.path;
      const index = findIndexForField(collection, fieldPath);
      if (index) {
        const queryValue = valueArg.value;
        const indexOperation = operation;
        if (!index.supports(indexOperation)) {
          return { canOptimize: false, matchingKeys: /* @__PURE__ */ new Set(), isExact: false };
        }
        if ((operation === `gt` || operation === `gte` || operation === `lt` || operation === `lte`) && !canRangeOptimize(queryValue, index, collection)) {
          return { canOptimize: false, matchingKeys: /* @__PURE__ */ new Set(), isExact: false };
        }
        const matchingKeys = index.lookup(indexOperation, queryValue);
        const isExact = operation === `lt` || operation === `lte` ? false : isExactComparisonValue(queryValue);
        return { canOptimize: true, matchingKeys, isExact };
      }
    }
    return { canOptimize: false, matchingKeys: /* @__PURE__ */ new Set(), isExact: false };
  }
  function optimizeAndExpression(expression, collection) {
    if (expression.type !== `func` || expression.args.length < 2) {
      return { canOptimize: false, matchingKeys: /* @__PURE__ */ new Set(), isExact: false };
    }
    const compoundRangeResult = optimizeCompoundRangeQuery(expression, collection);
    const coveredArgIndices = compoundRangeResult.canOptimize ? compoundRangeResult.coveredArgIndices : /* @__PURE__ */ new Set();
    const results = [];
    if (compoundRangeResult.canOptimize) {
      results.push(compoundRangeResult);
    }
    let allConjunctsExact = !compoundRangeResult.canOptimize ? true : compoundRangeResult.isExact;
    for (const [argIndex, arg] of expression.args.entries()) {
      if (coveredArgIndices.has(argIndex)) {
        continue;
      }
      const result = optimizeQueryRecursive(arg, collection);
      if (result.canOptimize) {
        results.push(result);
        if (!result.isExact) {
          allConjunctsExact = false;
        }
      } else {
        allConjunctsExact = false;
      }
    }
    if (results.length > 0) {
      const allMatchingSets = results.map((r) => r.matchingKeys);
      const intersectedKeys = intersectSets(allMatchingSets);
      return {
        canOptimize: true,
        matchingKeys: intersectedKeys,
        isExact: allConjunctsExact
      };
    }
    return { canOptimize: false, matchingKeys: /* @__PURE__ */ new Set(), isExact: false };
  }
  function optimizeOrExpression(expression, collection) {
    if (expression.type !== `func` || expression.args.length < 2) {
      return { canOptimize: false, matchingKeys: /* @__PURE__ */ new Set(), isExact: false };
    }
    const results = [];
    for (const arg of expression.args) {
      const result = optimizeQueryRecursive(arg, collection);
      if (!result.canOptimize) {
        return { canOptimize: false, matchingKeys: /* @__PURE__ */ new Set(), isExact: false };
      }
      results.push(result);
    }
    const allMatchingSets = results.map((r) => r.matchingKeys);
    const unionedKeys = unionSets(allMatchingSets);
    return {
      canOptimize: true,
      matchingKeys: unionedKeys,
      // An inexact (superset) disjunct makes the union a superset as well
      isExact: results.every((r) => r.isExact)
    };
  }
  function optimizeInArrayExpression(expression, collection) {
    if (expression.type !== `func` || expression.args.length !== 2) {
      return { canOptimize: false, matchingKeys: /* @__PURE__ */ new Set(), isExact: false };
    }
    const fieldArg = expression.args[0];
    const arrayArg = expression.args[1];
    if (fieldArg.type === `ref` && arrayArg.type === `val` && Array.isArray(arrayArg.value)) {
      const fieldPath = fieldArg.path;
      const values = arrayArg.value;
      const index = findIndexForField(collection, fieldPath);
      const isExact = values.every((value) => isExactComparisonValue(value));
      if (index) {
        if (index.supports(`in`)) {
          const matchingKeys = index.lookup(`in`, values);
          return { canOptimize: true, matchingKeys, isExact };
        } else if (index.supports(`eq`)) {
          const matchingKeys = /* @__PURE__ */ new Set();
          for (const value of values) {
            const keysForValue = index.lookup(`eq`, value);
            for (const key of keysForValue) {
              matchingKeys.add(key);
            }
          }
          return { canOptimize: true, matchingKeys, isExact };
        }
      }
    }
    return { canOptimize: false, matchingKeys: /* @__PURE__ */ new Set(), isExact: false };
  }

  let devModeConfig = {
    collectionSizeThreshold: 1e3};
  function isDevModeEnabled() {
    return process.env.NODE_ENV !== `production`;
  }
  function emitIndexSuggestion(suggestion) {
    if (!isDevModeEnabled()) return;
    {
      console.warn(
        `[TanStack DB] Index suggestion for "${suggestion.collectionId}":
  ${suggestion.message}
  Field: ${suggestion.fieldPath.join(`.`)}
  Add index: collection.createIndex((row) => row.${suggestion.fieldPath.join(`.`)})`
      );
    }
  }
  function checkCollectionSizeForIndex(collectionId, collectionSize, fieldPath) {
    if (!isDevModeEnabled()) return;
    if (collectionSize > devModeConfig.collectionSizeThreshold) {
      emitIndexSuggestion({
        collectionId,
        fieldPath,
        message: `Collection has ${collectionSize} items. Queries on "${fieldPath.join(`.`)}" may benefit from an index.`});
    }
  }

  function shouldAutoIndex(collection) {
    return collection.config.autoIndex === `eager`;
  }
  function ensureIndexForField(fieldName, fieldPath, collection, compareOptions, compareFn) {
    if (hasVirtualPropPath(fieldPath)) {
      return;
    }
    if (!shouldAutoIndex(collection)) {
      return;
    }
    const compareOpts = compareOptions ?? {
      ...DEFAULT_COMPARE_OPTIONS,
      ...collection.compareOptions
    };
    const existingIndex = Array.from(collection.indexes.values()).find(
      (index) => index.matchesField(fieldPath) && index.matchesCompareOptions(compareOpts)
    );
    if (existingIndex) {
      return;
    }
    if (isDevModeEnabled()) {
      checkCollectionSizeForIndex(
        collection.id || `unknown`,
        collection.size,
        fieldPath
      );
    }
    try {
      collection.createIndex(
        (row) => {
          let current = row;
          for (const part of fieldPath) {
            current = current[part];
          }
          return current;
        },
        {
          name: `auto:${fieldPath.join(`.`)}`,
          options: compareFn ? { compareFn, compareOptions: compareOpts } : {}
        }
      );
    } catch (error) {
      console.warn(
        `${collection.id ? `[${collection.id}] ` : ``}Failed to create auto-index for field path "${fieldPath.join(`.`)}":`,
        error
      );
    }
  }
  function ensureIndexForExpression(expression, collection) {
    if (!shouldAutoIndex(collection)) {
      return;
    }
    const indexableExpressions = extractIndexableExpressions(expression);
    for (const { fieldName, fieldPath } of indexableExpressions) {
      ensureIndexForField(fieldName, fieldPath, collection);
    }
  }
  function extractIndexableExpressions(expression) {
    const results = [];
    function extractFromExpression(expr) {
      if (expr.type !== `func`) {
        return;
      }
      const func = expr;
      if (func.name === `and`) {
        for (const arg of func.args) {
          extractFromExpression(arg);
        }
        return;
      }
      const supportedOperations = [`eq`, `gt`, `gte`, `lt`, `lte`, `in`];
      if (!supportedOperations.includes(func.name)) {
        return;
      }
      if (func.args.length < 1 || func.args[0].type !== `ref`) {
        return;
      }
      const fieldRef = func.args[0];
      const fieldPath = fieldRef.path;
      if (fieldPath.length === 0) {
        return;
      }
      const fieldName = fieldPath.join(`_`);
      results.push({ fieldName, fieldPath });
    }
    extractFromExpression(expression);
    return results;
  }

  function compareKeys(a, b) {
    if (typeof a === typeof b) {
      if (a < b) return -1;
      if (a > b) return 1;
      return 0;
    }
    return typeof a === `string` ? -1 : 1;
  }

  function buildCompareOptions(clause, collection) {
    if (clause.compareOptions.stringSort !== void 0) {
      return clause.compareOptions;
    }
    return {
      ...collection.compareOptions,
      direction: clause.compareOptions.direction,
      nulls: clause.compareOptions.nulls
    };
  }

  function currentStateAsChanges(collection, options = {}) {
    const collectFilteredResults = (filterFn) => {
      const result = [];
      for (const [key, value] of collection.entries()) {
        if (filterFn?.(value) ?? true) {
          result.push({
            type: `insert`,
            key,
            value
          });
        }
      }
      return result;
    };
    if (options.limit !== void 0 && !options.orderBy) {
      throw new Error(`limit cannot be used without orderBy`);
    }
    if (options.orderBy) {
      const whereFilter = options.where ? createFilterFunctionFromExpression(options.where) : void 0;
      const orderedKeys = getOrderedKeys(
        collection,
        options.orderBy,
        options.limit,
        whereFilter,
        options.optimizedOnly
      );
      if (orderedKeys === void 0) {
        return;
      }
      const result = [];
      for (const key of orderedKeys) {
        const value = collection.get(key);
        if (value !== void 0) {
          result.push({
            type: `insert`,
            key,
            value
          });
        }
      }
      return result;
    }
    if (!options.where) {
      return collectFilteredResults();
    }
    try {
      const expression = options.where;
      const optimizationResult = optimizeExpressionWithIndexes(
        expression,
        collection
      );
      if (optimizationResult.canOptimize) {
        const filterFn = optimizationResult.isExact ? void 0 : createFilterFunctionFromExpression(expression);
        const result = [];
        for (const key of optimizationResult.matchingKeys) {
          const value = collection.get(key);
          if (value !== void 0 && (filterFn?.(value) ?? true)) {
            result.push({
              type: `insert`,
              key,
              value
            });
          }
        }
        return result;
      } else {
        if (options.optimizedOnly) {
          return;
        }
        const filterFn = createFilterFunctionFromExpression(expression);
        return collectFilteredResults(filterFn);
      }
    } catch (error) {
      console.warn(
        `${collection.id ? `[${collection.id}] ` : ``}Error processing where clause, falling back to full scan:`,
        error
      );
      const filterFn = createFilterFunctionFromExpression(options.where);
      if (options.optimizedOnly) {
        return;
      }
      return collectFilteredResults(filterFn);
    }
  }
  function createFilterFunctionFromExpression(expression) {
    const evaluator = compileSingleRowExpression(expression);
    return (item) => {
      try {
        const result = evaluator(item);
        return toBooleanPredicate(result);
      } catch {
        return false;
      }
    };
  }
  function createFilteredCallback(originalCallback, options) {
    const filterFn = createFilterFunctionFromExpression(options.whereExpression);
    return (changes) => {
      const filteredChanges = [];
      for (const change of changes) {
        if (change.type === `insert`) {
          if (filterFn(change.value)) {
            filteredChanges.push(change);
          }
        } else if (change.type === `update`) {
          const newValueMatches = filterFn(change.value);
          const oldValueMatches = change.previousValue ? filterFn(change.previousValue) : false;
          if (newValueMatches && oldValueMatches) {
            filteredChanges.push(change);
          } else if (newValueMatches && !oldValueMatches) {
            filteredChanges.push({
              ...change,
              type: `insert`
            });
          } else if (!newValueMatches && oldValueMatches) {
            filteredChanges.push({
              ...change,
              type: `delete`,
              value: change.previousValue
              // Use the previous value for the delete
            });
          }
        } else {
          if (filterFn(change.value)) {
            filteredChanges.push(change);
          }
        }
      }
      if (filteredChanges.length > 0 || changes.length === 0) {
        originalCallback(filteredChanges);
      }
    };
  }
  function getOrderedKeys(collection, orderBy, limit, whereFilter, optimizedOnly) {
    if (orderBy.length === 1) {
      const clause = orderBy[0];
      const orderByExpression = clause.expression;
      if (orderByExpression.type === `ref`) {
        const propRef = orderByExpression;
        const fieldPath = propRef.path;
        const compareOpts = buildCompareOptions(clause, collection);
        ensureIndexForField(
          fieldPath[0],
          fieldPath,
          collection,
          compareOpts
        );
        const index = findIndexForField(collection, fieldPath, compareOpts);
        if (index && index.supports(`gt`)) {
          const filterFn = (key) => {
            const value = collection.get(key);
            if (value === void 0) {
              return false;
            }
            return whereFilter?.(value) ?? true;
          };
          return index.takeFromStart(limit ?? index.keyCount, filterFn);
        }
      }
    }
    if (optimizedOnly) {
      return;
    }
    const allItems = [];
    for (const [key, value] of collection.entries()) {
      if (whereFilter?.(value) ?? true) {
        allItems.push({ key, value });
      }
    }
    const compare = (a, b) => {
      for (const clause of orderBy) {
        const compareFn = makeComparator(clause.compareOptions);
        const aValue = extractValueFromItem(a.value, clause.expression);
        const bValue = extractValueFromItem(b.value, clause.expression);
        const result = compareFn(aValue, bValue);
        if (result !== 0) {
          return result;
        }
      }
      return 0;
    };
    allItems.sort(compare);
    const sortedKeys = allItems.map((item) => item.key);
    if (limit !== void 0) {
      return sortedKeys.slice(0, limit);
    }
    return sortedKeys;
  }
  function extractValueFromItem(item, expression) {
    if (expression.type === `ref`) {
      const propRef = expression;
      let value = item;
      for (const pathPart of propRef.path) {
        value = value?.[pathPart];
      }
      return value;
    } else if (expression.type === `val`) {
      return expression.value;
    } else {
      const evaluator = compileSingleRowExpression(expression);
      return evaluator(item);
    }
  }

  class SortedMap {
    /**
     * Creates a new SortedMap instance
     *
     * @param comparator - Optional function to compare values for sorting.
     *                     If not provided, entries are sorted by key only.
     */
    constructor(comparator) {
      this.map = /* @__PURE__ */ new Map();
      this.sortedKeys = [];
      this.comparator = comparator;
    }
    /**
     * Finds the index where a key-value pair should be inserted to maintain sort order.
     * Uses binary search to find the correct position based on the value (if comparator provided),
     * with key-based tie-breaking for deterministic ordering when values compare as equal.
     * If no comparator is provided, sorts by key only.
     * Runs in O(log n) time.
     *
     * @param key - The key to find position for (used as tie-breaker or primary sort when no comparator)
     * @param value - The value to compare against (only used if comparator is provided)
     * @returns The index where the key should be inserted
     */
    indexOf(key, value) {
      let left = 0;
      let right = this.sortedKeys.length;
      if (!this.comparator) {
        while (left < right) {
          const mid = Math.floor((left + right) / 2);
          const midKey = this.sortedKeys[mid];
          const keyComparison = compareKeys(key, midKey);
          if (keyComparison < 0) {
            right = mid;
          } else if (keyComparison > 0) {
            left = mid + 1;
          } else {
            return mid;
          }
        }
        return left;
      }
      while (left < right) {
        const mid = Math.floor((left + right) / 2);
        const midKey = this.sortedKeys[mid];
        const midValue = this.map.get(midKey);
        const valueComparison = this.comparator(value, midValue);
        if (valueComparison < 0) {
          right = mid;
        } else if (valueComparison > 0) {
          left = mid + 1;
        } else {
          const keyComparison = compareKeys(key, midKey);
          if (keyComparison < 0) {
            right = mid;
          } else if (keyComparison > 0) {
            left = mid + 1;
          } else {
            return mid;
          }
        }
      }
      return left;
    }
    /**
     * Sets a key-value pair in the map and maintains sort order
     *
     * @param key - The key to set
     * @param value - The value to associate with the key
     * @returns This SortedMap instance for chaining
     */
    set(key, value) {
      if (this.map.has(key)) {
        const oldValue = this.map.get(key);
        const oldIndex = this.indexOf(key, oldValue);
        this.sortedKeys.splice(oldIndex, 1);
      }
      const index = this.indexOf(key, value);
      this.sortedKeys.splice(index, 0, key);
      this.map.set(key, value);
      return this;
    }
    /**
     * Gets a value by its key
     *
     * @param key - The key to look up
     * @returns The value associated with the key, or undefined if not found
     */
    get(key) {
      return this.map.get(key);
    }
    /**
     * Removes a key-value pair from the map
     *
     * @param key - The key to remove
     * @returns True if the key was found and removed, false otherwise
     */
    delete(key) {
      if (this.map.has(key)) {
        const oldValue = this.map.get(key);
        const index = this.indexOf(key, oldValue);
        this.sortedKeys.splice(index, 1);
        return this.map.delete(key);
      }
      return false;
    }
    /**
     * Checks if a key exists in the map
     *
     * @param key - The key to check
     * @returns True if the key exists, false otherwise
     */
    has(key) {
      return this.map.has(key);
    }
    /**
     * Removes all key-value pairs from the map
     */
    clear() {
      this.map.clear();
      this.sortedKeys = [];
    }
    /**
     * Gets the number of key-value pairs in the map
     */
    get size() {
      return this.map.size;
    }
    /**
     * Default iterator that returns entries in sorted order
     *
     * @returns An iterator for the map's entries
     */
    *[Symbol.iterator]() {
      for (const key of this.sortedKeys) {
        yield [key, this.map.get(key)];
      }
    }
    /**
     * Returns an iterator for the map's entries in sorted order
     *
     * @returns An iterator for the map's entries
     */
    entries() {
      return this[Symbol.iterator]();
    }
    /**
     * Returns an iterator for the map's keys in sorted order
     *
     * @returns An iterator for the map's keys
     */
    keys() {
      return this.sortedKeys[Symbol.iterator]();
    }
    /**
     * Returns an iterator for the map's values in sorted order
     *
     * @returns An iterator for the map's values
     */
    values() {
      return (function* () {
        for (const key of this.sortedKeys) {
          yield this.map.get(key);
        }
      }).call(this);
    }
    /**
     * Executes a callback function for each key-value pair in the map in sorted order
     *
     * @param callbackfn - Function to execute for each entry
     */
    forEach(callbackfn) {
      for (const key of this.sortedKeys) {
        callbackfn(this.map.get(key), key, this.map);
      }
    }
  }

  const DIRECT_TRANSACTION_METADATA_KEY = `__tanstack_db_direct`;

  class CollectionStateManager {
    /**
     * Creates a new CollectionState manager
     */
    constructor(config) {
      this.pendingSyncedTransactions = [];
      this.syncedMetadata = /* @__PURE__ */ new Map();
      this.syncedCollectionMetadata = /* @__PURE__ */ new Map();
      this.optimisticUpserts = /* @__PURE__ */ new Map();
      this.optimisticDeletes = /* @__PURE__ */ new Set();
      this.pendingOptimisticUpserts = /* @__PURE__ */ new Map();
      this.pendingOptimisticDeletes = /* @__PURE__ */ new Set();
      this.pendingOptimisticDirectUpserts = /* @__PURE__ */ new Set();
      this.pendingOptimisticDirectDeletes = /* @__PURE__ */ new Set();
      this.rowOrigins = /* @__PURE__ */ new Map();
      this.pendingLocalChanges = /* @__PURE__ */ new Set();
      this.pendingLocalOrigins = /* @__PURE__ */ new Set();
      this.virtualPropsCache = /* @__PURE__ */ new WeakMap();
      this.size = 0;
      this.syncedKeys = /* @__PURE__ */ new Set();
      this.preSyncVisibleState = /* @__PURE__ */ new Map();
      this.recentlySyncedKeys = /* @__PURE__ */ new Set();
      this.hasReceivedFirstCommit = false;
      this.isCommittingSyncTransactions = false;
      this.isLocalOnly = false;
      this.commitPendingTransactions = () => {
        let hasPersistingTransaction = false;
        for (const transaction of this.transactions.values()) {
          if (transaction.state === `persisting`) {
            hasPersistingTransaction = true;
            break;
          }
        }
        const {
          committedSyncedTransactions,
          uncommittedSyncedTransactions,
          hasTruncateSync,
          hasImmediateSync
        } = this.pendingSyncedTransactions.reduce(
          (acc, t) => {
            if (t.committed) {
              acc.committedSyncedTransactions.push(t);
              if (t.truncate) {
                acc.hasTruncateSync = true;
              }
              if (t.immediate) {
                acc.hasImmediateSync = true;
              }
            } else {
              acc.uncommittedSyncedTransactions.push(t);
            }
            return acc;
          },
          {
            committedSyncedTransactions: [],
            uncommittedSyncedTransactions: [],
            hasTruncateSync: false,
            hasImmediateSync: false
          }
        );
        if (!hasPersistingTransaction || hasTruncateSync || hasImmediateSync) {
          this.isCommittingSyncTransactions = true;
          const truncateOptimisticSnapshot = hasTruncateSync ? committedSyncedTransactions.find((t) => t.truncate)?.optimisticSnapshot : null;
          let truncatePendingLocalChanges;
          let truncatePendingLocalOrigins;
          const changedKeys = /* @__PURE__ */ new Set();
          for (const transaction of committedSyncedTransactions) {
            for (const operation of transaction.operations) {
              changedKeys.add(operation.key);
            }
            for (const [key] of transaction.rowMetadataWrites) {
              changedKeys.add(key);
            }
          }
          const virtualSnapshotKeys = new Set(changedKeys);
          for (const key of this.pendingOptimisticDirectUpserts) {
            virtualSnapshotKeys.add(key);
          }
          for (const key of this.pendingOptimisticDirectDeletes) {
            virtualSnapshotKeys.add(key);
          }
          const previousRowOrigins = this.snapshotRowOriginsForKeys(virtualSnapshotKeys);
          const previousOptimisticUpserts = new Map(this.optimisticUpserts);
          const previousOptimisticDeletes = new Set(this.optimisticDeletes);
          let currentVisibleState = this.preSyncVisibleState;
          if (currentVisibleState.size === 0) {
            currentVisibleState = /* @__PURE__ */ new Map();
            for (const key of changedKeys) {
              const currentValue = this.get(key);
              if (currentValue !== void 0) {
                currentVisibleState.set(key, currentValue);
              }
            }
          }
          const events = [];
          const rowUpdateMode = this.config.sync.rowUpdateMode || `partial`;
          const completedOptimisticOps = /* @__PURE__ */ new Map();
          for (const transaction of this.transactions.values()) {
            if (transaction.state === `completed`) {
              for (const mutation of transaction.mutations) {
                if (this.isThisCollection(mutation.collection)) {
                  if (mutation.optimistic) {
                    completedOptimisticOps.set(mutation.key, {
                      type: mutation.type,
                      value: mutation.modified
                    });
                  }
                }
              }
            }
          }
          for (const transaction of committedSyncedTransactions) {
            if (transaction.truncate) {
              const visibleKeys = /* @__PURE__ */ new Set([
                ...this.syncedData.keys(),
                ...truncateOptimisticSnapshot?.upserts.keys() || []
              ]);
              for (const key of visibleKeys) {
                if (truncateOptimisticSnapshot?.deletes.has(key)) continue;
                const previousValue = truncateOptimisticSnapshot?.upserts.get(key) || this.syncedData.get(key);
                if (previousValue !== void 0) {
                  events.push({ type: `delete`, key, value: previousValue });
                }
              }
              truncatePendingLocalChanges = new Set(this.pendingLocalChanges);
              truncatePendingLocalOrigins = new Set(this.pendingLocalOrigins);
              this.syncedData.clear();
              this.syncedMetadata.clear();
              this.syncedKeys.clear();
              this.clearOriginTrackingState();
              for (const key of changedKeys) {
                currentVisibleState.delete(key);
              }
              this._events.emit(`truncate`, {
                type: `truncate`,
                collection: this.collection
              });
            }
            for (const operation of transaction.operations) {
              const key = operation.key;
              this.syncedKeys.add(key);
              const origin = this.isLocalOnly || this.pendingLocalChanges.has(key) || this.pendingLocalOrigins.has(key) || truncatePendingLocalChanges?.has(key) === true || truncatePendingLocalOrigins?.has(key) === true ? "local" : "remote";
              switch (operation.type) {
                case `insert`:
                  this.syncedData.set(key, operation.value);
                  this.rowOrigins.set(key, origin);
                  this.pendingLocalChanges.delete(key);
                  this.pendingLocalOrigins.delete(key);
                  this.pendingOptimisticUpserts.delete(key);
                  this.pendingOptimisticDeletes.delete(key);
                  this.pendingOptimisticDirectUpserts.delete(key);
                  this.pendingOptimisticDirectDeletes.delete(key);
                  break;
                case `update`: {
                  if (rowUpdateMode === `partial`) {
                    const updatedValue = Object.assign(
                      {},
                      this.syncedData.get(key),
                      operation.value
                    );
                    this.syncedData.set(key, updatedValue);
                  } else {
                    this.syncedData.set(key, operation.value);
                  }
                  this.rowOrigins.set(key, origin);
                  this.pendingLocalChanges.delete(key);
                  this.pendingLocalOrigins.delete(key);
                  this.pendingOptimisticUpserts.delete(key);
                  this.pendingOptimisticDeletes.delete(key);
                  this.pendingOptimisticDirectUpserts.delete(key);
                  this.pendingOptimisticDirectDeletes.delete(key);
                  break;
                }
                case `delete`:
                  this.syncedData.delete(key);
                  this.syncedMetadata.delete(key);
                  this.rowOrigins.delete(key);
                  this.pendingLocalChanges.delete(key);
                  this.pendingLocalOrigins.delete(key);
                  this.pendingOptimisticUpserts.delete(key);
                  this.pendingOptimisticDeletes.delete(key);
                  this.pendingOptimisticDirectUpserts.delete(key);
                  this.pendingOptimisticDirectDeletes.delete(key);
                  break;
              }
            }
            for (const [key, metadataWrite] of transaction.rowMetadataWrites) {
              if (metadataWrite.type === `delete`) {
                this.syncedMetadata.delete(key);
                continue;
              }
              this.syncedMetadata.set(key, metadataWrite.value);
            }
            for (const [
              key,
              metadataWrite
            ] of transaction.collectionMetadataWrites) {
              if (metadataWrite.type === `delete`) {
                this.syncedCollectionMetadata.delete(key);
                continue;
              }
              this.syncedCollectionMetadata.set(key, metadataWrite.value);
            }
          }
          if (hasTruncateSync) {
            const syncedInsertedOrUpdatedKeys = /* @__PURE__ */ new Set();
            for (const t of committedSyncedTransactions) {
              for (const op of t.operations) {
                if (op.type === `insert` || op.type === `update`) {
                  syncedInsertedOrUpdatedKeys.add(op.key);
                }
              }
            }
            const reapplyUpserts = new Map(
              truncateOptimisticSnapshot.upserts
            );
            const reapplyDeletes = new Set(
              truncateOptimisticSnapshot.deletes
            );
            for (const [key, value] of reapplyUpserts) {
              if (reapplyDeletes.has(key)) continue;
              if (syncedInsertedOrUpdatedKeys.has(key)) {
                let foundInsert = false;
                for (let i = events.length - 1; i >= 0; i--) {
                  const evt = events[i];
                  if (evt.key === key && evt.type === `insert`) {
                    evt.value = value;
                    foundInsert = true;
                    break;
                  }
                }
                if (!foundInsert) {
                  events.push({ type: `insert`, key, value });
                }
              } else {
                events.push({ type: `insert`, key, value });
              }
            }
            if (events.length > 0 && reapplyDeletes.size > 0) {
              const filtered = [];
              for (const evt of events) {
                if (evt.type === `insert` && reapplyDeletes.has(evt.key)) {
                  continue;
                }
                filtered.push(evt);
              }
              events.length = 0;
              events.push(...filtered);
            }
            if (this.lifecycle.status !== `ready`) {
              this.lifecycle.markReady();
            }
          }
          this.optimisticUpserts.clear();
          this.optimisticDeletes.clear();
          this.isCommittingSyncTransactions = false;
          if (hasTruncateSync && truncateOptimisticSnapshot) {
            for (const [key, value] of truncateOptimisticSnapshot.upserts) {
              this.optimisticUpserts.set(key, value);
            }
            for (const key of truncateOptimisticSnapshot.deletes) {
              this.optimisticDeletes.add(key);
            }
          }
          for (const transaction of this.transactions.values()) {
            if (![`completed`, `failed`].includes(transaction.state)) {
              for (const mutation of transaction.mutations) {
                if (this.isThisCollection(mutation.collection) && mutation.optimistic) {
                  switch (mutation.type) {
                    case `insert`:
                    case `update`:
                      this.optimisticUpserts.set(
                        mutation.key,
                        mutation.modified
                      );
                      this.optimisticDeletes.delete(mutation.key);
                      break;
                    case `delete`:
                      this.optimisticUpserts.delete(mutation.key);
                      this.optimisticDeletes.add(mutation.key);
                      break;
                  }
                }
              }
            }
          }
          for (const key of this.pendingOptimisticDirectUpserts) {
            if (!changedKeys.has(key)) {
              changedKeys.add(key);
              if (!currentVisibleState.has(key)) {
                const previousValue = previousOptimisticUpserts.get(key);
                if (previousValue !== void 0) {
                  currentVisibleState.set(key, previousValue);
                }
              }
              this.pendingOptimisticUpserts.delete(key);
              this.pendingLocalOrigins.delete(key);
            }
          }
          for (const key of this.pendingOptimisticDirectDeletes) {
            if (!changedKeys.has(key)) {
              changedKeys.add(key);
            }
            this.pendingOptimisticDeletes.delete(key);
            this.pendingLocalOrigins.delete(key);
          }
          this.pendingOptimisticDirectUpserts.clear();
          this.pendingOptimisticDirectDeletes.clear();
          for (const key of changedKeys) {
            const previousVisibleValue = currentVisibleState.get(key);
            const newVisibleValue = this.get(key);
            const previousVirtualProps = this.getVirtualPropsSnapshotForState(key, {
              rowOrigins: previousRowOrigins,
              optimisticUpserts: previousOptimisticUpserts,
              optimisticDeletes: previousOptimisticDeletes,
              completedOptimisticKeys: completedOptimisticOps
            });
            const nextVirtualProps = this.getVirtualPropsSnapshotForState(key);
            const virtualChanged = previousVirtualProps.$synced !== nextVirtualProps.$synced || previousVirtualProps.$origin !== nextVirtualProps.$origin;
            const previousValueWithVirtual = previousVisibleValue !== void 0 ? enrichRowWithVirtualProps(
              previousVisibleValue,
              key,
              this.collection.id,
              () => previousVirtualProps.$synced,
              () => previousVirtualProps.$origin
            ) : void 0;
            const completedOp = completedOptimisticOps.get(key);
            let isRedundantSync = false;
            if (completedOp) {
              if (completedOp.type === `delete` && previousVisibleValue !== void 0 && newVisibleValue === void 0 && deepEquals(completedOp.value, previousVisibleValue)) {
                isRedundantSync = true;
              } else if (newVisibleValue !== void 0 && deepEquals(completedOp.value, newVisibleValue)) {
                isRedundantSync = true;
              }
            }
            const shouldEmitVirtualUpdate = virtualChanged && previousVisibleValue !== void 0 && newVisibleValue !== void 0 && deepEquals(previousVisibleValue, newVisibleValue);
            if (isRedundantSync && !shouldEmitVirtualUpdate) {
              continue;
            }
            if (previousVisibleValue === void 0 && newVisibleValue !== void 0) {
              const completedOptimisticOp = completedOptimisticOps.get(key);
              if (completedOptimisticOp) {
                const previousValueFromCompleted = completedOptimisticOp.value;
                const previousValueWithVirtualFromCompleted = enrichRowWithVirtualProps(
                  previousValueFromCompleted,
                  key,
                  this.collection.id,
                  () => previousVirtualProps.$synced,
                  () => previousVirtualProps.$origin
                );
                events.push({
                  type: `update`,
                  key,
                  value: newVisibleValue,
                  previousValue: previousValueWithVirtualFromCompleted
                });
              } else {
                events.push({
                  type: `insert`,
                  key,
                  value: newVisibleValue
                });
              }
            } else if (previousVisibleValue !== void 0 && newVisibleValue === void 0) {
              events.push({
                type: `delete`,
                key,
                value: previousValueWithVirtual ?? previousVisibleValue
              });
            } else if (previousVisibleValue !== void 0 && newVisibleValue !== void 0 && (!deepEquals(previousVisibleValue, newVisibleValue) || shouldEmitVirtualUpdate)) {
              events.push({
                type: `update`,
                key,
                value: newVisibleValue,
                previousValue: previousValueWithVirtual ?? previousVisibleValue
              });
            }
          }
          this.size = this.calculateSize();
          if (events.length > 0) {
            this.indexes.updateIndexes(events);
          }
          this.changes.emitEvents(events, true);
          this.pendingSyncedTransactions = uncommittedSyncedTransactions;
          this.preSyncVisibleState.clear();
          Promise.resolve().then(() => {
            this.recentlySyncedKeys.clear();
          });
          if (!this.hasReceivedFirstCommit) {
            this.hasReceivedFirstCommit = true;
          }
        }
      };
      this.config = config;
      this.transactions = new SortedMap(
        (a, b) => a.compareCreatedAt(b)
      );
      this.syncedData = new SortedMap(config.compare);
    }
    setDeps(deps) {
      this.collection = deps.collection;
      this.lifecycle = deps.lifecycle;
      this.changes = deps.changes;
      this.indexes = deps.indexes;
      this._events = deps.events;
    }
    /**
     * Checks whether this row currently has no pending local optimistic writes.
     *
     * This is local mutation status, not backend confirmation: `true` means the
     * row is not currently affected by an optimistic transaction in this
     * collection's visible state.
     *
     * Used to compute the $synced virtual property.
     */
    isRowSynced(key) {
      if (this.isLocalOnly) {
        return true;
      }
      return !this.optimisticUpserts.has(key) && !this.optimisticDeletes.has(key);
    }
    /**
     * Gets the origin of the last confirmed change to a row.
     * Returns 'local' if the row has optimistic mutations (optimistic changes are local).
     * Used to compute the $origin virtual property.
     */
    getRowOrigin(key) {
      if (this.isLocalOnly) {
        return "local";
      }
      if (this.optimisticUpserts.has(key) || this.optimisticDeletes.has(key)) {
        return "local";
      }
      return this.rowOrigins.get(key) ?? "remote";
    }
    createVirtualPropsSnapshot(key, overrides) {
      return {
        $synced: overrides?.$synced ?? this.isRowSynced(key),
        $origin: overrides?.$origin ?? this.getRowOrigin(key),
        $key: overrides?.$key ?? key,
        $collectionId: overrides?.$collectionId ?? this.collection.id
      };
    }
    getVirtualPropsSnapshotForState(key, options) {
      if (this.isLocalOnly) {
        return this.createVirtualPropsSnapshot(key, {
          $synced: true,
          $origin: "local"
        });
      }
      const optimisticUpserts = options?.optimisticUpserts ?? this.optimisticUpserts;
      const optimisticDeletes = options?.optimisticDeletes ?? this.optimisticDeletes;
      const hasOptimisticChange = optimisticUpserts.has(key) || optimisticDeletes.has(key) || options?.completedOptimisticKeys?.has(key) === true;
      return this.createVirtualPropsSnapshot(key, {
        $synced: !hasOptimisticChange,
        $origin: hasOptimisticChange ? "local" : (options?.rowOrigins ?? this.rowOrigins).get(key) ?? "remote"
      });
    }
    snapshotRowOriginsForKeys(keys) {
      const rowOrigins = /* @__PURE__ */ new Map();
      for (const key of keys) {
        const origin = this.rowOrigins.get(key);
        if (origin !== void 0) {
          rowOrigins.set(key, origin);
        }
      }
      return rowOrigins;
    }
    enrichWithVirtualPropsSnapshot(row, virtualProps) {
      const existingRow = row;
      const synced = existingRow.$synced ?? virtualProps.$synced;
      const origin = existingRow.$origin ?? virtualProps.$origin;
      const resolvedKey = existingRow.$key ?? virtualProps.$key;
      const collectionId = existingRow.$collectionId ?? virtualProps.$collectionId;
      const cached = this.virtualPropsCache.get(row);
      if (cached && cached.synced === synced && cached.origin === origin && cached.key === resolvedKey && cached.collectionId === collectionId) {
        return cached.enriched;
      }
      const enriched = {
        ...row,
        $synced: synced,
        $origin: origin,
        $key: resolvedKey,
        $collectionId: collectionId
      };
      this.virtualPropsCache.set(row, {
        synced,
        origin,
        key: resolvedKey,
        collectionId,
        enriched
      });
      return enriched;
    }
    clearOriginTrackingState() {
      this.rowOrigins.clear();
      this.pendingLocalChanges.clear();
      this.pendingLocalOrigins.clear();
    }
    /**
     * Enriches a row with virtual properties using the "add-if-missing" pattern.
     * If the row already has virtual properties (from an upstream collection),
     * they are preserved. Otherwise, new values are computed.
     */
    enrichWithVirtualProps(row, key) {
      return this.enrichWithVirtualPropsSnapshot(
        row,
        this.createVirtualPropsSnapshot(key)
      );
    }
    /**
     * Creates a change message with virtual properties.
     * Uses the "add-if-missing" pattern so that pass-through from upstream
     * collections works correctly.
     */
    enrichChangeMessage(change) {
      const { __virtualProps } = change;
      const enrichedValue = __virtualProps?.value ? this.enrichWithVirtualPropsSnapshot(change.value, __virtualProps.value) : this.enrichWithVirtualProps(change.value, change.key);
      const enrichedPreviousValue = change.previousValue ? __virtualProps?.previousValue ? this.enrichWithVirtualPropsSnapshot(
        change.previousValue,
        __virtualProps.previousValue
      ) : this.enrichWithVirtualProps(change.previousValue, change.key) : void 0;
      return {
        key: change.key,
        type: change.type,
        value: enrichedValue,
        previousValue: enrichedPreviousValue,
        metadata: change.metadata
      };
    }
    /**
     * Get the current value for a key enriched with virtual properties.
     */
    getWithVirtualProps(key) {
      const value = this.get(key);
      if (value === void 0) {
        return void 0;
      }
      return this.enrichWithVirtualProps(value, key);
    }
    /**
     * Get the current value for a key (virtual derived state)
     */
    get(key) {
      const { optimisticDeletes, optimisticUpserts, syncedData } = this;
      if (optimisticDeletes.has(key)) {
        return void 0;
      }
      if (optimisticUpserts.has(key)) {
        return optimisticUpserts.get(key);
      }
      return syncedData.get(key);
    }
    /**
     * Check if a key exists in the collection (virtual derived state)
     */
    has(key) {
      const { optimisticDeletes, optimisticUpserts, syncedData } = this;
      if (optimisticDeletes.has(key)) {
        return false;
      }
      if (optimisticUpserts.has(key)) {
        return true;
      }
      return syncedData.has(key);
    }
    /**
     * Get all keys (virtual derived state)
     */
    *keys() {
      const { syncedData, optimisticDeletes, optimisticUpserts } = this;
      for (const key of syncedData.keys()) {
        if (!optimisticDeletes.has(key)) {
          yield key;
        }
      }
      for (const key of optimisticUpserts.keys()) {
        if (!syncedData.has(key) && !optimisticDeletes.has(key)) {
          yield key;
        }
      }
    }
    /**
     * Get all values (virtual derived state)
     */
    *values() {
      for (const key of this.keys()) {
        const value = this.get(key);
        if (value !== void 0) {
          yield value;
        }
      }
    }
    /**
     * Get all entries (virtual derived state)
     */
    *entries() {
      for (const key of this.keys()) {
        const value = this.get(key);
        if (value !== void 0) {
          yield [key, value];
        }
      }
    }
    /**
     * Get all entries (virtual derived state)
     */
    *[Symbol.iterator]() {
      for (const [key, value] of this.entries()) {
        yield [key, value];
      }
    }
    /**
     * Execute a callback for each entry in the collection
     */
    forEach(callbackfn) {
      let index = 0;
      for (const [key, value] of this.entries()) {
        callbackfn(value, key, index++);
      }
    }
    /**
     * Create a new array with the results of calling a function for each entry in the collection
     */
    map(callbackfn) {
      const result = [];
      let index = 0;
      for (const [key, value] of this.entries()) {
        result.push(callbackfn(value, key, index++));
      }
      return result;
    }
    /**
     * Check if the given collection is this collection
     * @param collection The collection to check
     * @returns True if the given collection is this collection, false otherwise
     */
    isThisCollection(collection) {
      return collection === this.collection;
    }
    /**
     * Recompute optimistic state from active transactions
     */
    recomputeOptimisticState(triggeredByUserAction = false) {
      if (this.isCommittingSyncTransactions && !triggeredByUserAction) {
        return;
      }
      const previousState = new Map(this.optimisticUpserts);
      const previousDeletes = new Set(this.optimisticDeletes);
      const previousRowOrigins = this.rowOrigins;
      for (const transaction of this.transactions.values()) {
        const isDirectTransaction = transaction.metadata[DIRECT_TRANSACTION_METADATA_KEY] === true;
        if (transaction.state === `completed`) {
          for (const mutation of transaction.mutations) {
            if (!this.isThisCollection(mutation.collection)) {
              continue;
            }
            this.pendingLocalOrigins.add(mutation.key);
            if (!mutation.optimistic) {
              continue;
            }
            switch (mutation.type) {
              case `insert`:
              case `update`:
                this.pendingOptimisticUpserts.set(
                  mutation.key,
                  mutation.modified
                );
                this.pendingOptimisticDeletes.delete(mutation.key);
                if (isDirectTransaction) {
                  this.pendingOptimisticDirectUpserts.add(mutation.key);
                  this.pendingOptimisticDirectDeletes.delete(mutation.key);
                } else {
                  this.pendingOptimisticDirectUpserts.delete(mutation.key);
                  this.pendingOptimisticDirectDeletes.delete(mutation.key);
                }
                break;
              case `delete`:
                this.pendingOptimisticUpserts.delete(mutation.key);
                this.pendingOptimisticDeletes.add(mutation.key);
                if (isDirectTransaction) {
                  this.pendingOptimisticDirectUpserts.delete(mutation.key);
                  this.pendingOptimisticDirectDeletes.add(mutation.key);
                } else {
                  this.pendingOptimisticDirectUpserts.delete(mutation.key);
                  this.pendingOptimisticDirectDeletes.delete(mutation.key);
                }
                break;
            }
          }
        } else if (transaction.state === `failed`) {
          for (const mutation of transaction.mutations) {
            if (!this.isThisCollection(mutation.collection)) {
              continue;
            }
            this.pendingLocalOrigins.delete(mutation.key);
            if (mutation.optimistic) {
              this.pendingOptimisticUpserts.delete(mutation.key);
              this.pendingOptimisticDeletes.delete(mutation.key);
              this.pendingOptimisticDirectUpserts.delete(mutation.key);
              this.pendingOptimisticDirectDeletes.delete(mutation.key);
            }
          }
        }
      }
      this.optimisticUpserts.clear();
      this.optimisticDeletes.clear();
      this.pendingLocalChanges.clear();
      const pendingSyncKeys = /* @__PURE__ */ new Set();
      for (const transaction of this.pendingSyncedTransactions) {
        for (const operation of transaction.operations) {
          pendingSyncKeys.add(operation.key);
        }
      }
      const staleOptimisticUpserts = [];
      for (const [key, value] of this.pendingOptimisticUpserts) {
        if (pendingSyncKeys.has(key) || this.pendingOptimisticDirectUpserts.has(key)) {
          this.optimisticUpserts.set(key, value);
        } else {
          staleOptimisticUpserts.push(key);
        }
      }
      for (const key of staleOptimisticUpserts) {
        this.pendingOptimisticUpserts.delete(key);
        this.pendingLocalOrigins.delete(key);
      }
      const staleOptimisticDeletes = [];
      for (const key of this.pendingOptimisticDeletes) {
        if (pendingSyncKeys.has(key) || this.pendingOptimisticDirectDeletes.has(key)) {
          this.optimisticDeletes.add(key);
        } else {
          staleOptimisticDeletes.push(key);
        }
      }
      for (const key of staleOptimisticDeletes) {
        this.pendingOptimisticDeletes.delete(key);
        this.pendingLocalOrigins.delete(key);
      }
      const activeTransactions = [];
      for (const transaction of this.transactions.values()) {
        if (![`completed`, `failed`].includes(transaction.state)) {
          activeTransactions.push(transaction);
        }
      }
      for (const transaction of activeTransactions) {
        for (const mutation of transaction.mutations) {
          if (!this.isThisCollection(mutation.collection)) {
            continue;
          }
          this.pendingLocalChanges.add(mutation.key);
          if (mutation.optimistic) {
            switch (mutation.type) {
              case `insert`:
              case `update`:
                this.optimisticUpserts.set(
                  mutation.key,
                  mutation.modified
                );
                this.optimisticDeletes.delete(mutation.key);
                break;
              case `delete`:
                this.optimisticUpserts.delete(mutation.key);
                this.optimisticDeletes.add(mutation.key);
                break;
            }
          }
        }
      }
      this.size = this.calculateSize();
      const events = [];
      this.collectOptimisticChanges(
        previousState,
        previousDeletes,
        previousRowOrigins,
        events
      );
      const filteredEventsBySyncStatus = events.filter((event) => {
        if (!this.recentlySyncedKeys.has(event.key)) {
          return true;
        }
        if (triggeredByUserAction) {
          return true;
        }
        return false;
      });
      if (this.pendingSyncedTransactions.length > 0 && !triggeredByUserAction) {
        const pendingSyncKeysForFilter = /* @__PURE__ */ new Set();
        for (const transaction of this.pendingSyncedTransactions) {
          for (const operation of transaction.operations) {
            pendingSyncKeysForFilter.add(operation.key);
          }
        }
        const filteredEvents = filteredEventsBySyncStatus.filter((event) => {
          if (event.type === `delete` && pendingSyncKeysForFilter.has(event.key)) {
            const hasActiveOptimisticMutation = activeTransactions.some(
              (tx) => tx.mutations.some(
                (m) => this.isThisCollection(m.collection) && m.key === event.key
              )
            );
            if (!hasActiveOptimisticMutation) {
              return false;
            }
          }
          return true;
        });
        if (filteredEvents.length > 0) {
          this.indexes.updateIndexes(filteredEvents);
        }
        this.changes.emitEvents(filteredEvents, triggeredByUserAction);
      } else {
        if (filteredEventsBySyncStatus.length > 0) {
          this.indexes.updateIndexes(filteredEventsBySyncStatus);
        }
        this.changes.emitEvents(filteredEventsBySyncStatus, triggeredByUserAction);
      }
    }
    /**
     * Calculate the current size based on synced data and optimistic changes
     */
    calculateSize() {
      const syncedSize = this.syncedData.size;
      const deletesFromSynced = Array.from(this.optimisticDeletes).filter(
        (key) => this.syncedData.has(key) && !this.optimisticUpserts.has(key)
      ).length;
      const upsertsNotInSynced = Array.from(this.optimisticUpserts.keys()).filter(
        (key) => !this.syncedData.has(key)
      ).length;
      return syncedSize - deletesFromSynced + upsertsNotInSynced;
    }
    /**
     * Collect events for optimistic changes
     */
    collectOptimisticChanges(previousUpserts, previousDeletes, previousRowOrigins, events) {
      const allKeys = /* @__PURE__ */ new Set([
        ...previousUpserts.keys(),
        ...this.optimisticUpserts.keys(),
        ...previousDeletes,
        ...this.optimisticDeletes
      ]);
      for (const key of allKeys) {
        const currentValue = this.get(key);
        const previousValue = this.getPreviousValue(
          key,
          previousUpserts,
          previousDeletes
        );
        const previousVirtualProps = this.getVirtualPropsSnapshotForState(key, {
          rowOrigins: previousRowOrigins,
          optimisticUpserts: previousUpserts,
          optimisticDeletes: previousDeletes
        });
        const nextVirtualProps = this.getVirtualPropsSnapshotForState(key);
        if (previousValue !== void 0 && currentValue === void 0) {
          events.push({
            type: `delete`,
            key,
            value: previousValue,
            __virtualProps: {
              value: previousVirtualProps
            }
          });
        } else if (previousValue === void 0 && currentValue !== void 0) {
          events.push({
            type: `insert`,
            key,
            value: currentValue,
            __virtualProps: {
              value: nextVirtualProps
            }
          });
        } else if (previousValue !== void 0 && currentValue !== void 0 && previousValue !== currentValue) {
          events.push({
            type: `update`,
            key,
            value: currentValue,
            previousValue,
            __virtualProps: {
              value: nextVirtualProps,
              previousValue: previousVirtualProps
            }
          });
        }
      }
    }
    /**
     * Get the previous value for a key given previous optimistic state
     */
    getPreviousValue(key, previousUpserts, previousDeletes) {
      if (previousDeletes.has(key)) {
        return void 0;
      }
      if (previousUpserts.has(key)) {
        return previousUpserts.get(key);
      }
      return this.syncedData.get(key);
    }
    /**
     * Schedule cleanup of a transaction when it completes
     */
    scheduleTransactionCleanup(transaction) {
      if (transaction.state === `completed`) {
        this.transactions.delete(transaction.id);
        return;
      }
      transaction.isPersisted.promise.then(() => {
        this.transactions.delete(transaction.id);
      }).catch(() => {
      });
    }
    /**
     * Capture visible state for keys that will be affected by pending sync operations
     * This must be called BEFORE onTransactionStateChange clears optimistic state
     */
    capturePreSyncVisibleState() {
      if (this.pendingSyncedTransactions.length === 0) return;
      const syncedKeys = /* @__PURE__ */ new Set();
      for (const transaction of this.pendingSyncedTransactions) {
        for (const operation of transaction.operations) {
          syncedKeys.add(operation.key);
        }
      }
      for (const key of syncedKeys) {
        this.recentlySyncedKeys.add(key);
      }
      for (const key of syncedKeys) {
        if (!this.preSyncVisibleState.has(key)) {
          const currentValue = this.get(key);
          if (currentValue !== void 0) {
            this.preSyncVisibleState.set(key, currentValue);
          }
        }
      }
    }
    /**
     * Trigger a recomputation when transactions change
     * This method should be called by the Transaction class when state changes
     */
    onTransactionStateChange() {
      this.changes.shouldBatchEvents = this.pendingSyncedTransactions.length > 0;
      this.capturePreSyncVisibleState();
      this.recomputeOptimisticState(false);
    }
    /**
     * Clean up the collection by stopping sync and clearing data
     * This can be called manually or automatically by garbage collection
     */
    cleanup() {
      this.syncedData.clear();
      this.syncedMetadata.clear();
      this.syncedCollectionMetadata.clear();
      this.optimisticUpserts.clear();
      this.optimisticDeletes.clear();
      this.pendingOptimisticUpserts.clear();
      this.pendingOptimisticDeletes.clear();
      this.pendingOptimisticDirectUpserts.clear();
      this.pendingOptimisticDirectDeletes.clear();
      this.clearOriginTrackingState();
      this.isLocalOnly = false;
      this.size = 0;
      this.pendingSyncedTransactions = [];
      this.syncedKeys.clear();
      this.hasReceivedFirstCommit = false;
    }
  }

  function createSingleRowRefProxy() {
    const cache = /* @__PURE__ */ new Map();
    function createProxy(path) {
      const pathKey = path.join(`.`);
      if (cache.has(pathKey)) {
        return cache.get(pathKey);
      }
      const proxy = new Proxy({}, {
        get(target, prop, receiver) {
          if (prop === `__refProxy`) return true;
          if (prop === `__path`) return path;
          if (prop === `__type`) return void 0;
          if (typeof prop === `symbol`) return Reflect.get(target, prop, receiver);
          const newPath = [...path, String(prop)];
          return createProxy(newPath);
        },
        has(target, prop) {
          if (prop === `__refProxy` || prop === `__path` || prop === `__type`)
            return true;
          return Reflect.has(target, prop);
        },
        ownKeys(target) {
          return Reflect.ownKeys(target);
        },
        getOwnPropertyDescriptor(target, prop) {
          if (prop === `__refProxy` || prop === `__path` || prop === `__type`) {
            return { enumerable: false, configurable: true };
          }
          return Reflect.getOwnPropertyDescriptor(target, prop);
        }
      });
      cache.set(pathKey, proxy);
      return proxy;
    }
    return createProxy([]);
  }
  function toExpression(value) {
    if (isRefProxy(value)) {
      return new PropRef(value.__path);
    }
    if (value && typeof value === `object` && (value.__brand === `ToArrayWrapper` || value.__brand === `ConcatToArrayWrapper` || value.__brand === `CaseWhenWrapper` || value.__brand === `MaterializeWrapper`)) {
      const name = value.__brand === `ToArrayWrapper` ? `toArray()` : value.__brand === `ConcatToArrayWrapper` ? `concat(toArray())` : value.__brand === `CaseWhenWrapper` ? `caseWhen()` : `materialize()`;
      throw new Error(
        `${name} cannot be used inside expressions (e.g., coalesce(), eq(), not()). Use ${name} directly as a select field value instead.`
      );
    }
    if (value && typeof value === `object` && `type` in value && (value.type === `func` || value.type === `ref` || value.type === `val` || value.type === `agg`)) {
      return value;
    }
    return new Value(value);
  }
  function isRefProxy(value) {
    return value && typeof value === `object` && value.__refProxy === true;
  }

  function eq(left, right) {
    return new Func(`eq`, [toExpression(left), toExpression(right)]);
  }
  function gt(left, right) {
    return new Func(`gt`, [toExpression(left), toExpression(right)]);
  }
  function gte(left, right) {
    return new Func(`gte`, [toExpression(left), toExpression(right)]);
  }
  function lt(left, right) {
    return new Func(`lt`, [toExpression(left), toExpression(right)]);
  }
  function and(left, right, ...rest) {
    const allArgs = [left, right, ...rest];
    return new Func(
      `and`,
      allArgs.map((arg) => toExpression(arg))
    );
  }
  function or(left, right, ...rest) {
    const allArgs = [left, right, ...rest];
    return new Func(
      `or`,
      allArgs.map((arg) => toExpression(arg))
    );
  }

  class EventEmitter {
    constructor() {
      this.listeners = /* @__PURE__ */ new Map();
    }
    /**
     * Subscribe to an event
     * @param event - Event name to listen for
     * @param callback - Function to call when event is emitted
     * @returns Unsubscribe function
     */
    on(event, callback) {
      if (!this.listeners.has(event)) {
        this.listeners.set(event, /* @__PURE__ */ new Set());
      }
      this.listeners.get(event).add(callback);
      return () => {
        this.listeners.get(event)?.delete(callback);
      };
    }
    /**
     * Subscribe to an event once (automatically unsubscribes after first emission)
     * @param event - Event name to listen for
     * @param callback - Function to call when event is emitted
     * @returns Unsubscribe function
     */
    once(event, callback) {
      const unsubscribe = this.on(event, (eventPayload) => {
        callback(eventPayload);
        unsubscribe();
      });
      return unsubscribe;
    }
    /**
     * Unsubscribe from an event
     * @param event - Event name to stop listening for
     * @param callback - Function to remove
     */
    off(event, callback) {
      this.listeners.get(event)?.delete(callback);
    }
    /**
     * Wait for an event to be emitted
     * @param event - Event name to wait for
     * @param timeout - Optional timeout in milliseconds
     * @returns Promise that resolves with the event payload
     */
    waitFor(event, timeout) {
      return new Promise((resolve, reject) => {
        let timeoutId;
        const unsubscribe = this.on(event, (eventPayload) => {
          if (timeoutId) {
            clearTimeout(timeoutId);
            timeoutId = void 0;
          }
          resolve(eventPayload);
          unsubscribe();
        });
        if (timeout) {
          timeoutId = setTimeout(() => {
            timeoutId = void 0;
            unsubscribe();
            reject(new Error(`Timeout waiting for event ${String(event)}`));
          }, timeout);
        }
      });
    }
    /**
     * Emit an event to all listeners
     * @param event - Event name to emit
     * @param eventPayload - Event payload
     * @internal For use by subclasses - subclasses should wrap this with a public emit if needed
     */
    emitInner(event, eventPayload) {
      this.listeners.get(event)?.forEach((listener) => {
        try {
          listener(eventPayload);
        } catch (error) {
          queueMicrotask(() => {
            throw error;
          });
        }
      });
    }
    /**
     * Clear all listeners
     */
    clearListeners() {
      this.listeners.clear();
    }
  }

  function buildCursor(orderBy, values) {
    if (values.length === 0 || orderBy.length === 0) {
      return void 0;
    }
    if (orderBy.length === 1) {
      const { expression, compareOptions } = orderBy[0];
      const operator = compareOptions.direction === `asc` ? gt : lt;
      return operator(expression, new Value(values[0]));
    }
    const clauses = [];
    for (let i = 0; i < orderBy.length && i < values.length; i++) {
      const clause = orderBy[i];
      const value = values[i];
      const eqConditions = [];
      for (let j = 0; j < i; j++) {
        const prevClause = orderBy[j];
        const prevValue = values[j];
        eqConditions.push(eq(prevClause.expression, new Value(prevValue)));
      }
      const operator = clause.compareOptions.direction === `asc` ? gt : lt;
      const comparison = operator(clause.expression, new Value(value));
      if (eqConditions.length === 0) {
        clauses.push(comparison);
      } else {
        const allConditions = [...eqConditions, comparison];
        clauses.push(allConditions.reduce((acc, cond) => and(acc, cond)));
      }
    }
    if (clauses.length === 1) {
      return clauses[0];
    }
    return clauses.reduce((acc, clause) => or(acc, clause));
  }

  class CollectionSubscription extends EventEmitter {
    constructor(collection, callback, options) {
      super();
      this.collection = collection;
      this.callback = callback;
      this.options = options;
      this.loadedInitialState = false;
      this.skipFiltering = false;
      this.snapshotSent = false;
      this.loadedSubsets = [];
      this.sentKeys = /* @__PURE__ */ new Set();
      this.limitedSnapshotRowCount = 0;
      this._status = `ready`;
      this.pendingLoadSubsetPromises = /* @__PURE__ */ new Set();
      this.isBufferingForTruncate = false;
      this.truncateBuffer = [];
      this.pendingTruncateRefetches = /* @__PURE__ */ new Set();
      if (options.onUnsubscribe) {
        this.on(`unsubscribed`, (event) => options.onUnsubscribe(event));
      }
      if (options.whereExpression) {
        ensureIndexForExpression(options.whereExpression, this.collection);
      }
      const callbackWithSentKeysTracking = (changes) => {
        callback(changes);
        this.trackSentKeys(changes);
      };
      this.callback = callbackWithSentKeysTracking;
      this.filteredCallback = options.whereExpression ? createFilteredCallback(this.callback, options) : this.callback;
      this.truncateCleanup = this.collection.on(`truncate`, () => {
        this.handleTruncate();
      });
    }
    get status() {
      return this._status;
    }
    /**
     * Handle collection truncate event by resetting state and re-requesting subsets.
     * This is called when the sync layer receives a must-refetch and clears all data.
     *
     * To prevent a flash of missing content, we buffer all changes (deletes from truncate
     * and inserts from refetch) until all loadSubset promises resolve, then emit them together.
     */
    handleTruncate() {
      const subsetsToReload = [...this.loadedSubsets];
      const hasLoadSubsetHandler = this.collection._sync.syncLoadSubsetFn !== null;
      if (subsetsToReload.length === 0 || !hasLoadSubsetHandler) {
        this.snapshotSent = false;
        this.loadedInitialState = false;
        this.limitedSnapshotRowCount = 0;
        this.lastSentKey = void 0;
        this.loadedSubsets = [];
        return;
      }
      this.isBufferingForTruncate = true;
      this.truncateBuffer = [];
      this.pendingTruncateRefetches.clear();
      this.snapshotSent = false;
      this.loadedInitialState = false;
      this.limitedSnapshotRowCount = 0;
      this.lastSentKey = void 0;
      this.loadedSubsets = [];
      queueMicrotask(() => {
        if (!this.isBufferingForTruncate) {
          return;
        }
        for (const options of subsetsToReload) {
          const syncResult = this.collection._sync.loadSubset(options);
          this.loadedSubsets.push(options);
          this.trackLoadSubsetPromise(syncResult);
          if (syncResult instanceof Promise) {
            this.pendingTruncateRefetches.add(syncResult);
            syncResult.catch(() => {
            }).finally(() => {
              this.pendingTruncateRefetches.delete(syncResult);
              this.checkTruncateRefetchComplete();
            });
          }
        }
        if (this.pendingTruncateRefetches.size === 0) {
          this.flushTruncateBuffer();
        }
      });
    }
    /**
     * Check if all truncate refetch promises have completed and flush buffer if so
     */
    checkTruncateRefetchComplete() {
      if (this.pendingTruncateRefetches.size === 0 && this.isBufferingForTruncate) {
        this.flushTruncateBuffer();
      }
    }
    /**
     * Flush the truncate buffer, emitting all buffered changes to the callback
     */
    flushTruncateBuffer() {
      this.isBufferingForTruncate = false;
      const merged = this.truncateBuffer.flat();
      if (merged.length > 0) {
        this.filteredCallback(merged);
      }
      this.truncateBuffer = [];
    }
    setOrderByIndex(index) {
      this.orderByIndex = index;
    }
    /**
     * Check if an orderBy index has been set for this subscription
     */
    hasOrderByIndex() {
      return this.orderByIndex !== void 0;
    }
    /**
     * Set subscription status and emit events if changed
     */
    setStatus(newStatus) {
      if (this._status === newStatus) {
        return;
      }
      const previousStatus = this._status;
      this._status = newStatus;
      this.emitInner(`status:change`, {
        type: `status:change`,
        subscription: this,
        previousStatus,
        status: newStatus
      });
      const eventKey = `status:${newStatus}`;
      this.emitInner(eventKey, {
        type: eventKey,
        subscription: this,
        previousStatus,
        status: newStatus
      });
    }
    /**
     * Track a loadSubset promise and manage loading status
     */
    trackLoadSubsetPromise(syncResult) {
      if (syncResult instanceof Promise) {
        this.pendingLoadSubsetPromises.add(syncResult);
        this.setStatus(`loadingSubset`);
        syncResult.finally(() => {
          this.pendingLoadSubsetPromises.delete(syncResult);
          if (this.pendingLoadSubsetPromises.size === 0) {
            this.setStatus(`ready`);
          }
        });
      }
    }
    hasLoadedInitialState() {
      return this.loadedInitialState;
    }
    hasSentAtLeastOneSnapshot() {
      return this.snapshotSent;
    }
    emitEvents(changes) {
      const newChanges = this.filterAndFlipChanges(changes);
      if (this.isBufferingForTruncate) {
        if (newChanges.length > 0) {
          this.truncateBuffer.push(newChanges);
        }
      } else {
        this.filteredCallback(newChanges);
      }
    }
    /**
     * Sends the snapshot to the callback.
     * Returns a boolean indicating if it succeeded.
     * It can only fail if there is no index to fulfill the request
     * and the optimizedOnly option is set to true,
     * or, the entire state was already loaded.
     */
    requestSnapshot(opts) {
      if (this.loadedInitialState) {
        return false;
      }
      const stateOpts = {
        where: this.options.whereExpression,
        optimizedOnly: opts?.optimizedOnly ?? false
      };
      if (opts) {
        if (`where` in opts) {
          const snapshotWhereExp = opts.where;
          if (stateOpts.where) {
            const subWhereExp = stateOpts.where;
            const combinedWhereExp = and(subWhereExp, snapshotWhereExp);
            stateOpts.where = combinedWhereExp;
          } else {
            stateOpts.where = snapshotWhereExp;
          }
        }
      } else {
        this.loadedInitialState = true;
      }
      const loadOptions = {
        where: stateOpts.where,
        subscription: this,
        // Include orderBy and limit if provided so sync layer can optimize the query
        orderBy: opts?.orderBy,
        limit: opts?.limit
      };
      const syncResult = this.collection._sync.loadSubset(loadOptions);
      opts?.onLoadSubsetResult?.(syncResult);
      this.loadedSubsets.push(loadOptions);
      const trackLoadSubsetPromise = opts?.trackLoadSubsetPromise ?? true;
      if (trackLoadSubsetPromise) {
        this.trackLoadSubsetPromise(syncResult);
      }
      const snapshot = this.collection.currentStateAsChanges(stateOpts);
      if (snapshot === void 0) {
        return false;
      }
      const filteredSnapshot = snapshot.filter(
        (change) => !this.sentKeys.has(change.key)
      );
      for (const change of filteredSnapshot) {
        this.sentKeys.add(change.key);
      }
      this.snapshotSent = true;
      this.callback(filteredSnapshot);
      return true;
    }
    /**
     * Sends a snapshot that fulfills the `where` clause and all rows are bigger or equal to the cursor.
     * Requires a range index to be set with `setOrderByIndex` prior to calling this method.
     * It uses that range index to load the items in the order of the index.
     *
     * For multi-column orderBy:
     * - Uses first value from `minValues` for LOCAL index operations (wide bounds, ensures no missed rows)
     * - Uses all `minValues` to build a precise composite cursor for SYNC layer loadSubset
     *
     * Note 1: it may load more rows than the provided LIMIT because it loads all values equal to the first cursor value + limit values greater.
     *         This is needed to ensure that it does not accidentally skip duplicate values when the limit falls in the middle of some duplicated values.
     * Note 2: it does not send keys that have already been sent before.
     */
    requestLimitedSnapshot({
      orderBy,
      limit,
      minValues,
      offset,
      trackLoadSubsetPromise: shouldTrackLoadSubsetPromise = true,
      onLoadSubsetResult
    }) {
      if (!limit) throw new Error(`limit is required`);
      if (!this.orderByIndex) {
        throw new Error(
          `Ordered snapshot was requested but no index was found. You have to call setOrderByIndex before requesting an ordered snapshot.`
        );
      }
      const hasMinValue = minValues !== void 0 && minValues.length > 0;
      const minValue = minValues?.[0];
      const minValueForIndex = minValue;
      const index = this.orderByIndex;
      const where = this.options.whereExpression;
      const whereFilterFn = where ? createFilterFunctionFromExpression(where) : void 0;
      const filterFn = (key) => {
        if (key !== void 0 && this.sentKeys.has(key)) {
          return false;
        }
        const value = this.collection.get(key);
        if (value === void 0) {
          return false;
        }
        return whereFilterFn?.(value) ?? true;
      };
      let biggestObservedValue = minValueForIndex;
      const changes = [];
      let keys = [];
      if (hasMinValue) {
        const { expression } = orderBy[0];
        const allRowsWithMinValue = this.collection.currentStateAsChanges({
          where: eq(expression, new Value(minValueForIndex))
        });
        if (allRowsWithMinValue) {
          const keysWithMinValue = allRowsWithMinValue.map((change) => change.key).filter((key) => !this.sentKeys.has(key) && filterFn(key));
          keys.push(...keysWithMinValue);
          const keysGreaterThanMin = index.take(
            limit - keys.length,
            minValueForIndex,
            filterFn
          );
          keys.push(...keysGreaterThanMin);
        } else {
          keys = index.take(limit, minValueForIndex, filterFn);
        }
      } else {
        keys = index.takeFromStart(limit, filterFn);
      }
      const valuesNeeded = () => Math.max(limit - changes.length, 0);
      const collectionExhausted = () => keys.length === 0;
      const orderByExpression = orderBy[0].expression;
      const valueExtractor = orderByExpression.type === `ref` ? compileExpression(new PropRef(orderByExpression.path), true) : null;
      while (valuesNeeded() > 0 && !collectionExhausted()) {
        const insertedKeys = /* @__PURE__ */ new Set();
        for (const key of keys) {
          const value = this.collection.get(key);
          changes.push({
            type: `insert`,
            key,
            value
          });
          biggestObservedValue = valueExtractor ? valueExtractor(value) : value;
          insertedKeys.add(key);
        }
        keys = index.take(valuesNeeded(), biggestObservedValue, filterFn);
      }
      const currentOffset = this.limitedSnapshotRowCount;
      for (const change of changes) {
        this.sentKeys.add(change.key);
      }
      this.callback(changes);
      this.limitedSnapshotRowCount += changes.length;
      if (changes.length > 0) {
        this.lastSentKey = changes[changes.length - 1].key;
      }
      let cursorExpressions;
      if (minValues !== void 0 && minValues.length > 0) {
        const whereFromCursor = buildCursor(orderBy, minValues);
        if (whereFromCursor) {
          const { expression } = orderBy[0];
          const cursorMinValue = minValues[0];
          let whereCurrentCursor;
          if (cursorMinValue instanceof Date) {
            const cursorMinValuePlus1ms = new Date(cursorMinValue.getTime() + 1);
            whereCurrentCursor = and(
              gte(expression, new Value(cursorMinValue)),
              lt(expression, new Value(cursorMinValuePlus1ms))
            );
          } else {
            whereCurrentCursor = eq(expression, new Value(cursorMinValue));
          }
          cursorExpressions = {
            whereFrom: whereFromCursor,
            whereCurrent: whereCurrentCursor,
            lastKey: this.lastSentKey
          };
        }
      }
      const loadOptions = {
        where,
        // Main filter only, no cursor
        limit,
        orderBy,
        cursor: cursorExpressions,
        // Cursor expressions passed separately
        offset: offset ?? currentOffset,
        // Use provided offset, or auto-tracked offset
        subscription: this
      };
      const syncResult = this.collection._sync.loadSubset(loadOptions);
      onLoadSubsetResult?.(syncResult);
      this.loadedSubsets.push(loadOptions);
      if (shouldTrackLoadSubsetPromise) {
        this.trackLoadSubsetPromise(syncResult);
      }
    }
    // TODO: also add similar test but that checks that it can also load it from the collection's loadSubset function
    //       and that that also works properly (i.e. does not skip duplicate values)
    /**
     * Filters and flips changes for keys that have not been sent yet.
     * Deletes are filtered out for keys that have not been sent yet.
     * Updates are flipped into inserts for keys that have not been sent yet.
     * Duplicate inserts are filtered out to prevent D2 multiplicity > 1.
     */
    filterAndFlipChanges(changes) {
      if (this.loadedInitialState || this.skipFiltering) {
        return changes;
      }
      const skipDeleteFilter = this.isBufferingForTruncate;
      const newChanges = [];
      for (const change of changes) {
        let newChange = change;
        const keyInSentKeys = this.sentKeys.has(change.key);
        if (!keyInSentKeys) {
          if (change.type === `update`) {
            newChange = { ...change, type: `insert`, previousValue: void 0 };
          } else if (change.type === `delete`) {
            if (!skipDeleteFilter) {
              continue;
            }
          }
          this.sentKeys.add(change.key);
        } else {
          if (change.type === `insert`) {
            continue;
          } else if (change.type === `delete`) {
            this.sentKeys.delete(change.key);
          }
        }
        newChanges.push(newChange);
      }
      return newChanges;
    }
    trackSentKeys(changes) {
      if (this.loadedInitialState || this.skipFiltering) {
        return;
      }
      for (const change of changes) {
        if (change.type === `delete`) {
          this.sentKeys.delete(change.key);
        } else {
          this.sentKeys.add(change.key);
        }
      }
      if (this.orderByIndex) {
        this.limitedSnapshotRowCount = Math.max(
          this.limitedSnapshotRowCount,
          this.sentKeys.size
        );
      }
    }
    /**
     * Mark that the subscription should not filter any changes.
     * This is used when includeInitialState is explicitly set to false,
     * meaning the caller doesn't want initial state but does want ALL future changes.
     */
    markAllStateAsSeen() {
      this.skipFiltering = true;
    }
    unsubscribe() {
      this.truncateCleanup?.();
      this.truncateCleanup = void 0;
      this.isBufferingForTruncate = false;
      this.truncateBuffer = [];
      this.pendingTruncateRefetches.clear();
      for (const options of this.loadedSubsets) {
        this.collection._sync.unloadSubset(options);
      }
      this.loadedSubsets = [];
      this.emitInner(`unsubscribed`, {
        type: `unsubscribed`,
        subscription: this
      });
      this.clearListeners();
    }
  }

  class CollectionChangesManager {
    /**
     * Creates a new CollectionChangesManager instance
     */
    constructor() {
      this.activeSubscribersCount = 0;
      this.changeSubscriptions = /* @__PURE__ */ new Set();
      this.batchedEvents = [];
      this.shouldBatchEvents = false;
    }
    setDeps(deps) {
      this.lifecycle = deps.lifecycle;
      this.sync = deps.sync;
      this.events = deps.events;
      this.collection = deps.collection;
      this.state = deps.state;
    }
    /**
     * Emit an empty ready event to notify subscribers that the collection is ready
     * This bypasses the normal empty array check in emitEvents
     */
    emitEmptyReadyEvent() {
      for (const subscription of this.changeSubscriptions) {
        subscription.emitEvents([]);
      }
    }
    /**
     * Enriches a change message with virtual properties ($synced, $origin, $key, $collectionId).
     * Uses the "add-if-missing" pattern to preserve virtual properties from upstream collections.
     */
    enrichChangeWithVirtualProps(change) {
      return this.state.enrichChangeMessage(change);
    }
    /**
     * Emit events either immediately or batch them for later emission
     */
    emitEvents(changes, forceEmit = false) {
      if (this.shouldBatchEvents && !forceEmit) {
        this.batchedEvents.push(...changes);
        return;
      }
      let rawEvents = changes;
      if (forceEmit) {
        if (this.batchedEvents.length > 0) {
          rawEvents = [...this.batchedEvents, ...changes];
        }
        this.batchedEvents = [];
        this.shouldBatchEvents = false;
      }
      if (rawEvents.length === 0) {
        return;
      }
      const enrichedEvents = rawEvents.map((change) => this.enrichChangeWithVirtualProps(change));
      for (const subscription of this.changeSubscriptions) {
        subscription.emitEvents(enrichedEvents);
      }
    }
    /**
     * Subscribe to changes in the collection
     */
    subscribeChanges(callback, options = {}) {
      this.addSubscriber();
      if (options.where && options.whereExpression) {
        throw new Error(
          `Cannot specify both 'where' and 'whereExpression' options. Use one or the other.`
        );
      }
      const { where, ...opts } = options;
      let whereExpression = opts.whereExpression;
      if (where) {
        const proxy = createSingleRowRefProxy();
        const result = where(proxy);
        whereExpression = toExpression(result);
      }
      const subscription = new CollectionSubscription(this.collection, callback, {
        ...opts,
        whereExpression,
        onUnsubscribe: () => {
          this.removeSubscriber();
          this.changeSubscriptions.delete(subscription);
        }
      });
      if (options.onStatusChange) {
        subscription.on(`status:change`, options.onStatusChange);
      }
      if (options.includeInitialState) {
        subscription.requestSnapshot({
          trackLoadSubsetPromise: false,
          orderBy: options.orderBy,
          limit: options.limit,
          onLoadSubsetResult: options.onLoadSubsetResult
        });
      } else if (options.includeInitialState === false) {
        subscription.markAllStateAsSeen();
      }
      this.changeSubscriptions.add(subscription);
      return subscription;
    }
    /**
     * Increment the active subscribers count and start sync if needed
     */
    addSubscriber() {
      const previousSubscriberCount = this.activeSubscribersCount;
      this.activeSubscribersCount++;
      this.lifecycle.cancelGCTimer();
      if (this.lifecycle.status === `cleaned-up` || this.lifecycle.status === `idle`) {
        this.sync.startSync();
      }
      this.events.emitSubscribersChange(
        this.activeSubscribersCount,
        previousSubscriberCount
      );
    }
    /**
     * Decrement the active subscribers count and start GC timer if needed
     */
    removeSubscriber() {
      const previousSubscriberCount = this.activeSubscribersCount;
      this.activeSubscribersCount--;
      if (this.activeSubscribersCount === 0) {
        this.lifecycle.startGCTimer();
      } else if (this.activeSubscribersCount < 0) {
        throw new NegativeActiveSubscribersError();
      }
      this.events.emitSubscribersChange(
        this.activeSubscribersCount,
        previousSubscriberCount
      );
    }
    /**
     * Clean up the collection by stopping sync and clearing data
     * This can be called manually or automatically by garbage collection
     */
    cleanup() {
      this.batchedEvents = [];
      this.shouldBatchEvents = false;
    }
  }

  const requestIdleCallbackPolyfill = (callback) => {
    const timeout = 0;
    const timeoutId = setTimeout(() => {
      callback({
        didTimeout: true,
        // Always indicate timeout for the polyfill
        timeRemaining: () => 50
        // Return some time remaining for polyfill
      });
    }, timeout);
    return timeoutId;
  };
  const cancelIdleCallbackPolyfill = (id) => {
    clearTimeout(id);
  };
  const safeRequestIdleCallback = typeof window !== `undefined` && `requestIdleCallback` in window ? (callback, options) => window.requestIdleCallback(callback, options) : (callback, _options) => requestIdleCallbackPolyfill(callback);
  const safeCancelIdleCallback = typeof window !== `undefined` && `cancelIdleCallback` in window ? (id) => window.cancelIdleCallback(id) : cancelIdleCallbackPolyfill;

  const _CleanupQueue = class _CleanupQueue {
    constructor() {
      this.tasks = /* @__PURE__ */ new Map();
      this.timeoutId = null;
      this.microtaskScheduled = false;
    }
    static getInstance() {
      if (!_CleanupQueue.instance) {
        _CleanupQueue.instance = new _CleanupQueue();
      }
      return _CleanupQueue.instance;
    }
    /**
     * Queues a cleanup task and defers timeout selection to a microtask so
     * multiple synchronous registrations can share one root timer.
     */
    schedule(key, gcTime, callback) {
      const executeAt = Date.now() + gcTime;
      this.tasks.set(key, { executeAt, callback });
      if (!this.microtaskScheduled) {
        this.microtaskScheduled = true;
        Promise.resolve().then(() => {
          this.microtaskScheduled = false;
          this.updateTimeout();
        });
      }
    }
    cancel(key) {
      this.tasks.delete(key);
    }
    /**
     * Keeps only one active timeout: whichever task is due next.
     */
    updateTimeout() {
      if (this.timeoutId !== null) {
        clearTimeout(this.timeoutId);
        this.timeoutId = null;
      }
      if (this.tasks.size === 0) {
        return;
      }
      let earliestTime = Infinity;
      for (const task of this.tasks.values()) {
        if (task.executeAt < earliestTime) {
          earliestTime = task.executeAt;
        }
      }
      const delay = Math.max(0, earliestTime - Date.now());
      this.timeoutId = setTimeout(() => this.process(), delay);
    }
    /**
     * Runs every task whose deadline has passed, then schedules the next wakeup
     * if there is still pending work.
     */
    process() {
      this.timeoutId = null;
      const now = Date.now();
      for (const [key, task] of this.tasks.entries()) {
        if (now >= task.executeAt) {
          this.tasks.delete(key);
          try {
            task.callback();
          } catch (error) {
            console.error("Error in CleanupQueue task:", error);
          }
        }
      }
      if (this.tasks.size > 0) {
        this.updateTimeout();
      }
    }
    /**
     * Resets the singleton instance for tests.
     */
    static resetInstance() {
      if (_CleanupQueue.instance) {
        if (_CleanupQueue.instance.timeoutId !== null) {
          clearTimeout(_CleanupQueue.instance.timeoutId);
        }
        _CleanupQueue.instance = null;
      }
    }
  };
  _CleanupQueue.instance = null;
  let CleanupQueue = _CleanupQueue;

  class CollectionLifecycleManager {
    /**
     * Creates a new CollectionLifecycleManager instance
     */
    constructor(config, id) {
      this.status = `idle`;
      this.hasBeenReady = false;
      this.hasReceivedFirstCommit = false;
      this.onFirstReadyCallbacks = [];
      this.idleCallbackId = null;
      this.config = config;
      this.id = id;
    }
    setDeps(deps) {
      this.indexes = deps.indexes;
      this.events = deps.events;
      this.changes = deps.changes;
      this.sync = deps.sync;
      this.state = deps.state;
    }
    /**
     * Validates state transitions to prevent invalid status changes
     */
    validateStatusTransition(from, to) {
      if (from === to) {
        return;
      }
      const validTransitions = {
        idle: [`loading`, `error`, `cleaned-up`],
        loading: [`ready`, `error`, `cleaned-up`],
        ready: [`cleaned-up`, `error`],
        error: [`cleaned-up`, `idle`],
        "cleaned-up": [`loading`, `error`]
      };
      if (!validTransitions[from].includes(to)) {
        throw new InvalidCollectionStatusTransitionError(from, to, this.id);
      }
    }
    /**
     * Safely update the collection status with validation
     * @private
     */
    setStatus(newStatus, allowReady = false) {
      if (newStatus === `ready` && !allowReady) {
        throw new CollectionStateError(
          `You can't directly call "setStatus('ready'). You must use markReady instead.`
        );
      }
      this.validateStatusTransition(this.status, newStatus);
      const previousStatus = this.status;
      this.status = newStatus;
      this.events.emitStatusChange(newStatus, previousStatus);
    }
    /**
     * Validates that the collection is in a usable state for data operations
     * @private
     */
    validateCollectionUsable(operation) {
      switch (this.status) {
        case `error`:
          throw new CollectionInErrorStateError(operation, this.id);
        case `cleaned-up`:
          this.sync.startSync();
          break;
      }
    }
    /**
     * Mark the collection as ready for use
     * This is called by sync implementations to explicitly signal that the collection is ready,
     * providing a more intuitive alternative to using commits for readiness signaling
     * @private - Should only be called by sync implementations
     */
    markReady() {
      this.validateStatusTransition(this.status, `ready`);
      if (this.status === `loading`) {
        this.setStatus(`ready`, true);
        if (!this.hasBeenReady) {
          this.hasBeenReady = true;
          if (!this.hasReceivedFirstCommit) {
            this.hasReceivedFirstCommit = true;
          }
          const callbacks = [...this.onFirstReadyCallbacks];
          this.onFirstReadyCallbacks = [];
          callbacks.forEach((callback) => callback());
        }
        if (this.changes.changeSubscriptions.size > 0) {
          this.changes.emitEmptyReadyEvent();
        }
      }
    }
    /**
     * Start the garbage collection timer
     * Called when the collection becomes inactive (no subscribers)
     */
    startGCTimer() {
      const gcTime = this.config.gcTime ?? 3e5;
      if (gcTime <= 0 || !Number.isFinite(gcTime)) {
        return;
      }
      CleanupQueue.getInstance().schedule(this, gcTime, () => {
        if (this.changes.activeSubscribersCount === 0) {
          this.scheduleIdleCleanup();
        }
      });
    }
    /**
     * Cancel the garbage collection timer
     * Called when the collection becomes active again
     */
    cancelGCTimer() {
      CleanupQueue.getInstance().cancel(this);
      if (this.idleCallbackId !== null) {
        safeCancelIdleCallback(this.idleCallbackId);
        this.idleCallbackId = null;
      }
    }
    /**
     * Schedule cleanup to run during browser idle time
     * This prevents blocking the UI thread during cleanup operations
     */
    scheduleIdleCleanup() {
      if (this.idleCallbackId !== null) {
        safeCancelIdleCallback(this.idleCallbackId);
      }
      this.idleCallbackId = safeRequestIdleCallback(
        (deadline) => {
          if (this.changes.activeSubscribersCount === 0) {
            const cleanupCompleted = this.performCleanup(deadline);
            if (cleanupCompleted) {
              this.idleCallbackId = null;
            }
          } else {
            this.idleCallbackId = null;
          }
        },
        { timeout: 1e3 }
      );
    }
    /**
     * Perform cleanup operations, optionally in chunks during idle time
     * @returns true if cleanup was completed, false if it was rescheduled
     */
    performCleanup(deadline) {
      const hasTime = !deadline || deadline.timeRemaining() > 0 || deadline.didTimeout;
      if (hasTime) {
        this.sync.cleanup();
        this.state.cleanup();
        this.changes.cleanup();
        this.indexes.cleanup();
        CleanupQueue.getInstance().cancel(this);
        this.hasBeenReady = false;
        const callbacks = [...this.onFirstReadyCallbacks];
        this.onFirstReadyCallbacks = [];
        callbacks.forEach((callback) => {
          try {
            callback();
          } catch (error) {
            console.error(
              `${this.config.id ? `[${this.config.id}] ` : ``}Error in onFirstReady callback during cleanup:`,
              error
            );
          }
        });
        this.setStatus(`cleaned-up`);
        this.events.cleanup();
        return true;
      } else {
        this.scheduleIdleCleanup();
        return false;
      }
    }
    /**
     * Register a callback to be executed when the collection first becomes ready
     * Useful for preloading collections
     * @param callback Function to call when the collection first becomes ready
     */
    onFirstReady(callback) {
      if (this.hasBeenReady) {
        callback();
        return;
      }
      this.onFirstReadyCallbacks.push(callback);
    }
    cleanup() {
      if (this.idleCallbackId !== null) {
        safeCancelIdleCallback(this.idleCallbackId);
        this.idleCallbackId = null;
      }
      this.performCleanup();
    }
  }

  const LIVE_QUERY_INTERNAL = /* @__PURE__ */ Symbol(`liveQueryInternal`);

  class CollectionSyncManager {
    /**
     * Creates a new CollectionSyncManager instance
     */
    constructor(config, id) {
      this.preloadPromise = null;
      this.syncCleanupFn = null;
      this.syncLoadSubsetFn = null;
      this.syncUnloadSubsetFn = null;
      this.pendingLoadSubsetPromises = /* @__PURE__ */ new Set();
      this.config = config;
      this.id = id;
      this.syncMode = config.syncMode ?? `eager`;
    }
    setDeps(deps) {
      this.collection = deps.collection;
      this.state = deps.state;
      this.lifecycle = deps.lifecycle;
      this._events = deps.events;
    }
    /**
     * Start the sync process for this collection
     * This is called when the collection is first accessed or preloaded
     */
    startSync() {
      if (this.lifecycle.status !== `idle` && this.lifecycle.status !== `cleaned-up`) {
        return;
      }
      this.lifecycle.setStatus(`loading`);
      try {
        const syncRes = normalizeSyncFnResult(
          this.config.sync.sync({
            collection: this.collection,
            begin: (options) => {
              this.state.pendingSyncedTransactions.push({
                committed: false,
                operations: [],
                deletedKeys: /* @__PURE__ */ new Set(),
                rowMetadataWrites: /* @__PURE__ */ new Map(),
                collectionMetadataWrites: /* @__PURE__ */ new Map(),
                immediate: options?.immediate
              });
            },
            write: (messageWithOptionalKey) => {
              const pendingTransaction = this.state.pendingSyncedTransactions[this.state.pendingSyncedTransactions.length - 1];
              if (!pendingTransaction) {
                throw new NoPendingSyncTransactionWriteError();
              }
              if (pendingTransaction.committed) {
                throw new SyncTransactionAlreadyCommittedWriteError();
              }
              let key = void 0;
              if (`key` in messageWithOptionalKey) {
                key = messageWithOptionalKey.key;
              } else {
                key = this.config.getKey(messageWithOptionalKey.value);
              }
              if (this.state.pendingLocalChanges.has(key)) {
                this.state.pendingLocalOrigins.add(key);
              }
              let messageType = messageWithOptionalKey.type;
              if (messageWithOptionalKey.type === `insert`) {
                const insertingIntoExistingSynced = this.state.syncedData.has(key);
                const hasPendingDeleteForKey = pendingTransaction.deletedKeys.has(key);
                const isTruncateTransaction = pendingTransaction.truncate === true;
                if (insertingIntoExistingSynced && !hasPendingDeleteForKey && !isTruncateTransaction) {
                  const existingValue = this.state.syncedData.get(key);
                  const valuesEqual = existingValue !== void 0 && deepEquals(existingValue, messageWithOptionalKey.value);
                  if (valuesEqual) {
                    messageType = `update`;
                  } else {
                    const utils = this.config.utils;
                    const internal = utils?.[LIVE_QUERY_INTERNAL];
                    throw new DuplicateKeySyncError(key, this.id, {
                      hasCustomGetKey: internal?.hasCustomGetKey ?? false,
                      hasJoins: internal?.hasJoins ?? false,
                      hasDistinct: internal?.hasDistinct ?? false
                    });
                  }
                }
              }
              const message = {
                ...messageWithOptionalKey,
                type: messageType,
                key
              };
              pendingTransaction.operations.push(message);
              if (messageType === `delete`) {
                pendingTransaction.deletedKeys.add(key);
                pendingTransaction.rowMetadataWrites.set(key, { type: `delete` });
              } else if (messageType === `insert`) {
                if (message.metadata !== void 0) {
                  pendingTransaction.rowMetadataWrites.set(key, {
                    type: `set`,
                    value: message.metadata
                  });
                } else {
                  pendingTransaction.rowMetadataWrites.set(key, {
                    type: `delete`
                  });
                }
              } else if (message.metadata !== void 0) {
                pendingTransaction.rowMetadataWrites.set(key, {
                  type: `set`,
                  value: message.metadata
                });
              }
            },
            commit: () => {
              const pendingTransaction = this.state.pendingSyncedTransactions[this.state.pendingSyncedTransactions.length - 1];
              if (!pendingTransaction) {
                throw new NoPendingSyncTransactionCommitError();
              }
              if (pendingTransaction.committed) {
                throw new SyncTransactionAlreadyCommittedError();
              }
              pendingTransaction.committed = true;
              this.state.commitPendingTransactions();
            },
            markReady: () => {
              this.lifecycle.markReady();
            },
            truncate: () => {
              const pendingTransaction = this.state.pendingSyncedTransactions[this.state.pendingSyncedTransactions.length - 1];
              if (!pendingTransaction) {
                throw new NoPendingSyncTransactionWriteError();
              }
              if (pendingTransaction.committed) {
                throw new SyncTransactionAlreadyCommittedWriteError();
              }
              pendingTransaction.operations = [];
              pendingTransaction.deletedKeys.clear();
              pendingTransaction.rowMetadataWrites.clear();
              pendingTransaction.truncate = true;
              pendingTransaction.optimisticSnapshot = {
                upserts: new Map(this.state.optimisticUpserts),
                deletes: new Set(this.state.optimisticDeletes)
              };
            },
            metadata: this.createSyncMetadataApi()
          })
        );
        this.syncCleanupFn = syncRes?.cleanup ?? null;
        this.syncLoadSubsetFn = syncRes?.loadSubset ?? null;
        this.syncUnloadSubsetFn = syncRes?.unloadSubset ?? null;
        if (this.syncMode === `on-demand` && !this.syncLoadSubsetFn) {
          throw new CollectionConfigurationError(
            `Collection "${this.id}" is configured with syncMode "on-demand" but the sync function did not return a loadSubset handler. Either provide a loadSubset handler or use syncMode "eager".`
          );
        }
      } catch (error) {
        this.lifecycle.setStatus(`error`);
        throw error;
      }
    }
    getActivePendingSyncTransaction() {
      const pendingTransaction = this.state.pendingSyncedTransactions[this.state.pendingSyncedTransactions.length - 1];
      if (!pendingTransaction) {
        throw new NoPendingSyncTransactionWriteError();
      }
      if (pendingTransaction.committed) {
        throw new SyncTransactionAlreadyCommittedWriteError();
      }
      return pendingTransaction;
    }
    createSyncMetadataApi() {
      return {
        row: {
          get: (key) => {
            const pendingTransaction = this.state.pendingSyncedTransactions[this.state.pendingSyncedTransactions.length - 1];
            const pendingWrite = pendingTransaction?.rowMetadataWrites.get(key);
            if (pendingWrite) {
              return pendingWrite.type === `delete` ? void 0 : pendingWrite.value;
            }
            if (pendingTransaction?.truncate) {
              return void 0;
            }
            return this.state.syncedMetadata.get(key);
          },
          set: (key, metadata) => {
            const pendingTransaction = this.getActivePendingSyncTransaction();
            pendingTransaction.rowMetadataWrites.set(key, {
              type: `set`,
              value: metadata
            });
          },
          delete: (key) => {
            const pendingTransaction = this.getActivePendingSyncTransaction();
            pendingTransaction.rowMetadataWrites.set(key, {
              type: `delete`
            });
          }
        },
        collection: {
          get: (key) => {
            const pendingTransaction = this.state.pendingSyncedTransactions[this.state.pendingSyncedTransactions.length - 1];
            const pendingWrite = pendingTransaction?.collectionMetadataWrites.get(key);
            if (pendingWrite) {
              return pendingWrite.type === `delete` ? void 0 : pendingWrite.value;
            }
            return this.state.syncedCollectionMetadata.get(key);
          },
          set: (key, value) => {
            const pendingTransaction = this.getActivePendingSyncTransaction();
            pendingTransaction.collectionMetadataWrites.set(key, {
              type: `set`,
              value
            });
          },
          delete: (key) => {
            const pendingTransaction = this.getActivePendingSyncTransaction();
            pendingTransaction.collectionMetadataWrites.set(key, {
              type: `delete`
            });
          },
          list: (prefix) => {
            const merged = new Map(this.state.syncedCollectionMetadata);
            const pendingTransaction = this.state.pendingSyncedTransactions[this.state.pendingSyncedTransactions.length - 1];
            if (pendingTransaction) {
              for (const [
                key,
                pendingWrite
              ] of pendingTransaction.collectionMetadataWrites) {
                if (pendingWrite.type === `delete`) {
                  merged.delete(key);
                } else {
                  merged.set(key, pendingWrite.value);
                }
              }
            }
            return Array.from(merged.entries()).filter(([key]) => prefix ? key.startsWith(prefix) : true).map(([key, value]) => ({
              key,
              value
            }));
          }
        }
      };
    }
    /**
     * Preload the collection data by starting sync if not already started
     * Multiple concurrent calls will share the same promise
     */
    preload() {
      if (this.preloadPromise) {
        return this.preloadPromise;
      }
      if (this.syncMode === `on-demand`) {
        console.warn(
          `${this.id ? `[${this.id}] ` : ``}Calling .preload() on a collection with syncMode "on-demand" is a no-op. In on-demand mode, data is only loaded when queries request it. Instead, create a live query and call .preload() on that to load the specific data you need. See https://tanstack.com/blog/tanstack-db-0.5-query-driven-sync for more details.`
        );
      }
      this.preloadPromise = new Promise((resolve, reject) => {
        if (this.lifecycle.status === `ready`) {
          resolve();
          return;
        }
        if (this.lifecycle.status === `error`) {
          reject(new CollectionIsInErrorStateError());
          return;
        }
        this.lifecycle.onFirstReady(() => {
          resolve();
        });
        if (this.lifecycle.status === `idle` || this.lifecycle.status === `cleaned-up`) {
          try {
            this.startSync();
          } catch (error) {
            reject(error);
            return;
          }
        }
      });
      return this.preloadPromise;
    }
    /**
     * Gets whether the collection is currently loading more data
     */
    get isLoadingSubset() {
      return this.pendingLoadSubsetPromises.size > 0;
    }
    /**
     * Tracks a load promise for isLoadingSubset state.
     * @internal This is for internal coordination (e.g., live-query glue code), not for general use.
     */
    trackLoadPromise(promise) {
      const loadingStarting = !this.isLoadingSubset;
      this.pendingLoadSubsetPromises.add(promise);
      if (loadingStarting) {
        this._events.emit(`loadingSubset:change`, {
          type: `loadingSubset:change`,
          collection: this.collection,
          isLoadingSubset: true,
          previousIsLoadingSubset: false,
          loadingSubsetTransition: `start`
        });
      }
      promise.finally(() => {
        const loadingEnding = this.pendingLoadSubsetPromises.size === 1 && this.pendingLoadSubsetPromises.has(promise);
        this.pendingLoadSubsetPromises.delete(promise);
        if (loadingEnding) {
          this._events.emit(`loadingSubset:change`, {
            type: `loadingSubset:change`,
            collection: this.collection,
            isLoadingSubset: false,
            previousIsLoadingSubset: true,
            loadingSubsetTransition: `end`
          });
        }
      });
    }
    /**
     * Requests the sync layer to load more data.
     * @param options Options to control what data is being loaded
     * @returns If data loading is asynchronous, this method returns a promise that resolves when the data is loaded.
     *          Returns true if no sync function is configured, if syncMode is 'eager', or if there is no work to do.
     */
    loadSubset(options) {
      if (this.syncMode === `eager`) {
        return true;
      }
      if (this.syncLoadSubsetFn) {
        const result = this.syncLoadSubsetFn(options);
        if (result instanceof Promise) {
          this.trackLoadPromise(result);
          return result;
        }
      }
      return true;
    }
    /**
     * Notifies the sync layer that a subset is no longer needed.
     * @param options Options that identify what data is being unloaded
     */
    unloadSubset(options) {
      if (this.syncUnloadSubsetFn) {
        this.syncUnloadSubsetFn(options);
      }
    }
    cleanup() {
      try {
        if (this.syncCleanupFn) {
          this.syncCleanupFn();
          this.syncCleanupFn = null;
        }
      } catch (error) {
        queueMicrotask(() => {
          if (error instanceof Error) {
            const wrappedError = new SyncCleanupError(this.id, error);
            wrappedError.cause = error;
            wrappedError.stack = error.stack;
            throw wrappedError;
          } else {
            throw new SyncCleanupError(this.id, error);
          }
        });
      }
      this.preloadPromise = null;
    }
  }
  function normalizeSyncFnResult(result) {
    if (typeof result === `function`) {
      return { cleanup: result };
    }
    if (typeof result === `object`) {
      return result;
    }
    return void 0;
  }

  const INDEX_SIGNATURE_VERSION = 1;
  function compareStringsCodePoint(left, right) {
    if (left === right) {
      return 0;
    }
    return left < right ? -1 : 1;
  }
  function resolveResolverMetadata(resolver) {
    return {
      kind: `constructor`,
      ...resolver.name ? { name: resolver.name } : {}
    };
  }
  function toSerializableIndexValue(value) {
    if (value == null) {
      return value;
    }
    switch (typeof value) {
      case `string`:
      case `boolean`:
        return value;
      case `number`:
        return Number.isFinite(value) ? value : null;
      case `bigint`:
        return { __type: `bigint`, value: value.toString() };
      case `function`:
      case `symbol`:
        return void 0;
      case `undefined`:
        return void 0;
    }
    if (Array.isArray(value)) {
      return value.map((entry) => toSerializableIndexValue(entry) ?? null);
    }
    if (value instanceof Date) {
      return {
        __type: `date`,
        value: value.toISOString()
      };
    }
    if (value instanceof Set) {
      const serializedValues = Array.from(value).map((entry) => toSerializableIndexValue(entry) ?? null).sort(
        (a, b) => compareStringsCodePoint(
          stableStringifyCollectionIndexValue(a),
          stableStringifyCollectionIndexValue(b)
        )
      );
      return {
        __type: `set`,
        values: serializedValues
      };
    }
    if (value instanceof Map) {
      const serializedEntries = Array.from(value.entries()).map(([mapKey, mapValue]) => ({
        key: toSerializableIndexValue(mapKey) ?? null,
        value: toSerializableIndexValue(mapValue) ?? null
      })).sort(
        (a, b) => compareStringsCodePoint(
          stableStringifyCollectionIndexValue(a.key),
          stableStringifyCollectionIndexValue(b.key)
        )
      );
      return {
        __type: `map`,
        entries: serializedEntries
      };
    }
    if (value instanceof RegExp) {
      return {
        __type: `regexp`,
        value: value.toString()
      };
    }
    const serializedObject = {};
    const entries = Object.entries(value).sort(
      ([leftKey], [rightKey]) => compareStringsCodePoint(leftKey, rightKey)
    );
    for (const [key, entryValue] of entries) {
      const serializedEntry = toSerializableIndexValue(entryValue);
      if (serializedEntry !== void 0) {
        serializedObject[key] = serializedEntry;
      }
    }
    return serializedObject;
  }
  function stableStringifyCollectionIndexValue(value) {
    if (value === null) {
      return `null`;
    }
    if (Array.isArray(value)) {
      return `[${value.map(stableStringifyCollectionIndexValue).join(`,`)}]`;
    }
    if (typeof value !== `object`) {
      return JSON.stringify(value);
    }
    const sortedKeys = Object.keys(value).sort(
      (left, right) => compareStringsCodePoint(left, right)
    );
    const serializedEntries = sortedKeys.map(
      (key) => `${JSON.stringify(key)}:${stableStringifyCollectionIndexValue(value[key])}`
    );
    return `{${serializedEntries.join(`,`)}}`;
  }
  function createCollectionIndexMetadata(indexId, expression, name, resolver, options) {
    const resolverMetadata = resolveResolverMetadata(resolver);
    const serializedExpression = toSerializableIndexValue(expression) ?? null;
    const serializedOptions = toSerializableIndexValue(options);
    const signatureInput = toSerializableIndexValue({
      signatureVersion: INDEX_SIGNATURE_VERSION,
      expression: serializedExpression,
      options: serializedOptions ?? null
    });
    const normalizedSignatureInput = signatureInput ?? null;
    const signature = stableStringifyCollectionIndexValue(
      normalizedSignatureInput
    );
    return {
      signatureVersion: INDEX_SIGNATURE_VERSION,
      signature,
      indexId,
      name,
      expression,
      resolver: resolverMetadata,
      ...serializedOptions === void 0 ? {} : { options: serializedOptions }
    };
  }
  function cloneSerializableIndexValue(value) {
    if (value === null || typeof value !== `object`) {
      return value;
    }
    if (Array.isArray(value)) {
      return value.map((entry) => cloneSerializableIndexValue(entry));
    }
    const cloned = {};
    for (const [key, entryValue] of Object.entries(value)) {
      cloned[key] = cloneSerializableIndexValue(entryValue);
    }
    return cloned;
  }
  function cloneExpression(expression) {
    return JSON.parse(JSON.stringify(expression));
  }
  class CollectionIndexesManager {
    constructor() {
      this.indexes = /* @__PURE__ */ new Map();
      this.indexMetadata = /* @__PURE__ */ new Map();
      this.indexCounter = 0;
    }
    setDeps(deps) {
      this.state = deps.state;
      this.lifecycle = deps.lifecycle;
      this.defaultIndexType = deps.defaultIndexType;
      this.events = deps.events;
    }
    /**
     * Creates an index on a collection for faster queries.
     *
     * @example
     * ```ts
     * // With explicit index type (recommended for tree-shaking)
     * import { BasicIndex } from '@tanstack/db'
     * collection.createIndex((row) => row.userId, { indexType: BasicIndex })
     *
     * // With collection's default index type
     * collection.createIndex((row) => row.userId)
     * ```
     */
    createIndex(indexCallback, config = {}) {
      this.lifecycle.validateCollectionUsable(`createIndex`);
      const indexId = ++this.indexCounter;
      const singleRowRefProxy = createSingleRowRefProxy();
      const indexExpression = indexCallback(singleRowRefProxy);
      const expression = toExpression(indexExpression);
      const IndexType = config.indexType ?? this.defaultIndexType;
      if (!IndexType) {
        throw new CollectionConfigurationError(
          `No index type specified and no defaultIndexType set on collection. Either pass indexType in config, or set defaultIndexType on the collection:
  import { BasicIndex } from '@tanstack/db'
  createCollection({ defaultIndexType: BasicIndex, ... })`
        );
      }
      const index = new IndexType(
        indexId,
        expression,
        config.name,
        config.options
      );
      index.build(this.state.entries());
      this.indexes.set(indexId, index);
      const metadata = createCollectionIndexMetadata(
        indexId,
        expression,
        config.name,
        IndexType,
        config.options
      );
      this.indexMetadata.set(indexId, metadata);
      this.events.emitIndexAdded(metadata);
      return index;
    }
    /**
     * Removes an index from this collection.
     * Returns true when an index existed and was removed, false otherwise.
     */
    removeIndex(indexOrId) {
      this.lifecycle.validateCollectionUsable(`removeIndex`);
      const indexId = typeof indexOrId === `number` ? indexOrId : indexOrId.id;
      const index = this.indexes.get(indexId);
      if (!index) {
        return false;
      }
      if (typeof indexOrId !== `number` && index !== indexOrId) {
        return false;
      }
      this.indexes.delete(indexId);
      const metadata = this.indexMetadata.get(indexId);
      this.indexMetadata.delete(indexId);
      if (metadata) {
        this.events.emitIndexRemoved(metadata);
      }
      return true;
    }
    /**
     * Returns a sorted snapshot of index metadata.
     * This allows persisted wrappers to bootstrap from indexes that were created
     * before they attached lifecycle listeners.
     */
    getIndexMetadataSnapshot() {
      return Array.from(this.indexMetadata.values()).sort((left, right) => left.indexId - right.indexId).map((metadata) => ({
        ...metadata,
        expression: cloneExpression(metadata.expression),
        resolver: { ...metadata.resolver },
        ...metadata.options === void 0 ? {} : { options: cloneSerializableIndexValue(metadata.options) }
      }));
    }
    /**
     * Updates all indexes when the collection changes
     */
    updateIndexes(changes) {
      for (const index of this.indexes.values()) {
        for (const change of changes) {
          switch (change.type) {
            case `insert`:
              index.add(change.key, change.value);
              break;
            case `update`:
              if (change.previousValue) {
                index.update(change.key, change.previousValue, change.value);
              } else {
                index.add(change.key, change.value);
              }
              break;
            case `delete`:
              index.remove(change.key, change.value);
              break;
          }
        }
      }
    }
    /**
     * Clean up indexes
     */
    cleanup() {
      this.indexes.clear();
      this.indexMetadata.clear();
    }
  }

  const CALLBACK_ITERATION_METHODS = /* @__PURE__ */ new Set([
    `find`,
    `findLast`,
    `findIndex`,
    `findLastIndex`,
    `filter`,
    `map`,
    `flatMap`,
    `forEach`,
    `some`,
    `every`,
    `reduce`,
    `reduceRight`
  ]);
  const ARRAY_MODIFYING_METHODS = /* @__PURE__ */ new Set([
    `pop`,
    `push`,
    `shift`,
    `unshift`,
    `splice`,
    `sort`,
    `reverse`,
    `fill`,
    `copyWithin`
  ]);
  const MAP_SET_MODIFYING_METHODS = /* @__PURE__ */ new Set([`set`, `delete`, `clear`, `add`]);
  const MAP_SET_ITERATOR_METHODS = /* @__PURE__ */ new Set([
    `entries`,
    `keys`,
    `values`,
    `forEach`
  ]);
  function isProxiableObject(value) {
    return value !== null && typeof value === `object` && !(value instanceof Date) && !(value instanceof RegExp) && !isTemporal(value);
  }
  function createArrayIterationHandler(methodName, methodFn, changeTracker, memoizedCreateChangeProxy) {
    if (!CALLBACK_ITERATION_METHODS.has(methodName)) {
      return void 0;
    }
    return function(...args) {
      const callback = args[0];
      if (typeof callback !== `function`) {
        return methodFn.apply(changeTracker.copy_, args);
      }
      const getProxiedElement = (element, index) => {
        if (isProxiableObject(element)) {
          const nestedParent = {
            tracker: changeTracker,
            prop: String(index)
          };
          const { proxy: elementProxy } = memoizedCreateChangeProxy(
            element,
            nestedParent
          );
          return elementProxy;
        }
        return element;
      };
      const wrappedCallback = function(element, index, array) {
        const proxiedElement = getProxiedElement(element, index);
        return callback.call(this, proxiedElement, index, array);
      };
      if (methodName === `reduce` || methodName === `reduceRight`) {
        const reduceCallback = function(accumulator, element, index, array) {
          const proxiedElement = getProxiedElement(element, index);
          return callback.call(this, accumulator, proxiedElement, index, array);
        };
        return methodFn.apply(changeTracker.copy_, [
          reduceCallback,
          ...args.slice(1)
        ]);
      }
      const result = methodFn.apply(changeTracker.copy_, [
        wrappedCallback,
        ...args.slice(1)
      ]);
      if ((methodName === `find` || methodName === `findLast`) && result && typeof result === `object`) {
        const foundIndex = changeTracker.copy_.indexOf(result);
        if (foundIndex !== -1) {
          return getProxiedElement(result, foundIndex);
        }
      }
      if (methodName === `filter` && Array.isArray(result)) {
        return result.map((element) => {
          const originalIndex = changeTracker.copy_.indexOf(element);
          if (originalIndex !== -1) {
            return getProxiedElement(element, originalIndex);
          }
          return element;
        });
      }
      return result;
    };
  }
  function createArrayIteratorHandler(changeTracker, memoizedCreateChangeProxy) {
    return function() {
      const array = changeTracker.copy_;
      let index = 0;
      return {
        next() {
          if (index >= array.length) {
            return { done: true, value: void 0 };
          }
          const element = array[index];
          let proxiedElement = element;
          if (isProxiableObject(element)) {
            const nestedParent = {
              tracker: changeTracker,
              prop: String(index)
            };
            const { proxy: elementProxy } = memoizedCreateChangeProxy(
              element,
              nestedParent
            );
            proxiedElement = elementProxy;
          }
          index++;
          return { done: false, value: proxiedElement };
        },
        [Symbol.iterator]() {
          return this;
        }
      };
    };
  }
  function createModifyingMethodHandler(methodFn, changeTracker, markChanged) {
    return function(...args) {
      const result = methodFn.apply(changeTracker.copy_, args);
      markChanged(changeTracker);
      return result;
    };
  }
  function createMapSetIteratorHandler(methodName, prop, methodFn, target, changeTracker, memoizedCreateChangeProxy, markChanged) {
    const isIteratorMethod = MAP_SET_ITERATOR_METHODS.has(methodName) || prop === Symbol.iterator;
    if (!isIteratorMethod) {
      return void 0;
    }
    return function(...args) {
      const result = methodFn.apply(changeTracker.copy_, args);
      if (methodName === `forEach`) {
        const callback = args[0];
        if (typeof callback === `function`) {
          const wrappedCallback = function(value, key, collection) {
            const cbresult = callback.call(this, value, key, collection);
            markChanged(changeTracker);
            return cbresult;
          };
          return methodFn.apply(target, [wrappedCallback, ...args.slice(1)]);
        }
      }
      const isValueIterator = methodName === `entries` || methodName === `values` || methodName === Symbol.iterator.toString() || prop === Symbol.iterator;
      if (isValueIterator) {
        const originalIterator = result;
        const valueToKeyMap = /* @__PURE__ */ new Map();
        if (methodName === `values` && target instanceof Map) {
          for (const [key, mapValue] of changeTracker.copy_.entries()) {
            valueToKeyMap.set(mapValue, key);
          }
        }
        const originalToModifiedMap = /* @__PURE__ */ new Map();
        if (target instanceof Set) {
          for (const setValue of changeTracker.copy_.values()) {
            originalToModifiedMap.set(setValue, setValue);
          }
        }
        return {
          next() {
            const nextResult = originalIterator.next();
            if (!nextResult.done && nextResult.value && typeof nextResult.value === `object`) {
              if (methodName === `entries` && Array.isArray(nextResult.value) && nextResult.value.length === 2) {
                if (nextResult.value[1] && typeof nextResult.value[1] === `object`) {
                  const mapKey = nextResult.value[0];
                  const mapParent = {
                    tracker: changeTracker,
                    prop: mapKey,
                    updateMap: (newValue) => {
                      if (changeTracker.copy_ instanceof Map) {
                        changeTracker.copy_.set(
                          mapKey,
                          newValue
                        );
                      }
                    }
                  };
                  const { proxy: valueProxy } = memoizedCreateChangeProxy(
                    nextResult.value[1],
                    mapParent
                  );
                  nextResult.value[1] = valueProxy;
                }
              } else if (methodName === `values` || methodName === Symbol.iterator.toString() || prop === Symbol.iterator) {
                if (methodName === `values` && target instanceof Map) {
                  const mapKey = valueToKeyMap.get(nextResult.value);
                  if (mapKey !== void 0) {
                    const mapParent = {
                      tracker: changeTracker,
                      prop: mapKey,
                      updateMap: (newValue) => {
                        if (changeTracker.copy_ instanceof Map) {
                          changeTracker.copy_.set(
                            mapKey,
                            newValue
                          );
                        }
                      }
                    };
                    const { proxy: valueProxy } = memoizedCreateChangeProxy(
                      nextResult.value,
                      mapParent
                    );
                    nextResult.value = valueProxy;
                  }
                } else if (target instanceof Set) {
                  const setOriginalValue = nextResult.value;
                  const setParent = {
                    tracker: changeTracker,
                    prop: setOriginalValue,
                    updateSet: (newValue) => {
                      if (changeTracker.copy_ instanceof Set) {
                        changeTracker.copy_.delete(
                          setOriginalValue
                        );
                        changeTracker.copy_.add(newValue);
                        originalToModifiedMap.set(setOriginalValue, newValue);
                      }
                    }
                  };
                  const { proxy: valueProxy } = memoizedCreateChangeProxy(
                    nextResult.value,
                    setParent
                  );
                  nextResult.value = valueProxy;
                } else {
                  const tempKey = /* @__PURE__ */ Symbol(`iterator-value`);
                  const { proxy: valueProxy } = memoizedCreateChangeProxy(
                    nextResult.value,
                    {
                      tracker: changeTracker,
                      prop: tempKey
                    }
                  );
                  nextResult.value = valueProxy;
                }
              }
            }
            return nextResult;
          },
          [Symbol.iterator]() {
            return this;
          }
        };
      }
      return result;
    };
  }
  function debugLog(...args) {
    const isBrowser = typeof window !== `undefined` && typeof localStorage !== `undefined`;
    if (isBrowser && localStorage.getItem(`DEBUG`) === `true`) {
      console.log(`[proxy]`, ...args);
    } else if (
      // true
      !isBrowser && typeof process !== `undefined` && process.env.DEBUG === `true`
    ) {
      console.log(`[proxy]`, ...args);
    }
  }
  function deepClone(obj, visited = /* @__PURE__ */ new WeakMap()) {
    if (obj === null || obj === void 0) {
      return obj;
    }
    if (typeof obj !== `object`) {
      return obj;
    }
    if (visited.has(obj)) {
      return visited.get(obj);
    }
    if (obj instanceof Date) {
      return new Date(obj.getTime());
    }
    if (obj instanceof RegExp) {
      return new RegExp(obj.source, obj.flags);
    }
    if (Array.isArray(obj)) {
      const arrayClone = [];
      visited.set(obj, arrayClone);
      obj.forEach((item, index) => {
        arrayClone[index] = deepClone(item, visited);
      });
      return arrayClone;
    }
    if (ArrayBuffer.isView(obj) && !(obj instanceof DataView)) {
      const TypedArrayConstructor = Object.getPrototypeOf(obj).constructor;
      const clone2 = new TypedArrayConstructor(
        obj.length
      );
      visited.set(obj, clone2);
      for (let i = 0; i < obj.length; i++) {
        clone2[i] = obj[i];
      }
      return clone2;
    }
    if (obj instanceof Map) {
      const clone2 = /* @__PURE__ */ new Map();
      visited.set(obj, clone2);
      obj.forEach((value, key) => {
        clone2.set(key, deepClone(value, visited));
      });
      return clone2;
    }
    if (obj instanceof Set) {
      const clone2 = /* @__PURE__ */ new Set();
      visited.set(obj, clone2);
      obj.forEach((value) => {
        clone2.add(deepClone(value, visited));
      });
      return clone2;
    }
    if (isTemporal(obj)) {
      return obj;
    }
    const clone = {};
    visited.set(obj, clone);
    for (const key in obj) {
      if (Object.prototype.hasOwnProperty.call(obj, key)) {
        clone[key] = deepClone(
          obj[key],
          visited
        );
      }
    }
    const symbolProps = Object.getOwnPropertySymbols(obj);
    for (const sym of symbolProps) {
      clone[sym] = deepClone(
        obj[sym],
        visited
      );
    }
    return clone;
  }
  let count = 0;
  function getProxyCount() {
    count += 1;
    return count;
  }
  function createChangeProxy(target, parent) {
    const changeProxyCache = /* @__PURE__ */ new Map();
    function memoizedCreateChangeProxy(innerTarget, innerParent) {
      debugLog(`Object ID:`, innerTarget.constructor.name);
      if (changeProxyCache.has(innerTarget)) {
        return changeProxyCache.get(innerTarget);
      } else {
        const changeProxy = createChangeProxy(innerTarget, innerParent);
        changeProxyCache.set(innerTarget, changeProxy);
        return changeProxy;
      }
    }
    const proxyCache = /* @__PURE__ */ new Map();
    const changeTracker = {
      copy_: deepClone(target),
      originalObject: deepClone(target),
      proxyCount: getProxyCount(),
      modified: false,
      assigned_: {},
      parent,
      target
      // Store reference to the target object
    };
    debugLog(
      `createChangeProxy called for target`,
      target,
      changeTracker.proxyCount
    );
    function markChanged(state) {
      if (!state.modified) {
        state.modified = true;
      }
      if (state.parent) {
        debugLog(`propagating change to parent`);
        if (`updateMap` in state.parent) {
          state.parent.updateMap(state.copy_);
        } else if (`updateSet` in state.parent) {
          state.parent.updateSet(state.copy_);
        } else {
          state.parent.tracker.copy_[state.parent.prop] = state.copy_;
          state.parent.tracker.assigned_[state.parent.prop] = true;
        }
        markChanged(state.parent.tracker);
      }
    }
    function checkIfReverted(state) {
      debugLog(
        `checkIfReverted called with assigned keys:`,
        Object.keys(state.assigned_)
      );
      if (Object.keys(state.assigned_).length === 0 && Object.getOwnPropertySymbols(state.assigned_).length === 0) {
        debugLog(`No assigned properties, returning true`);
        return true;
      }
      for (const prop in state.assigned_) {
        if (state.assigned_[prop] === true) {
          const currentValue = state.copy_[prop];
          const originalValue = state.originalObject[prop];
          debugLog(
            `Checking property ${String(prop)}, current:`,
            currentValue,
            `original:`,
            originalValue
          );
          if (!deepEquals(currentValue, originalValue)) {
            debugLog(`Property ${String(prop)} is different, returning false`);
            return false;
          }
        } else if (state.assigned_[prop] === false) {
          debugLog(`Property ${String(prop)} was deleted, returning false`);
          return false;
        }
      }
      const symbolProps = Object.getOwnPropertySymbols(state.assigned_);
      for (const sym of symbolProps) {
        if (state.assigned_[sym] === true) {
          const currentValue = state.copy_[sym];
          const originalValue = state.originalObject[sym];
          if (!deepEquals(currentValue, originalValue)) {
            debugLog(`Symbol property is different, returning false`);
            return false;
          }
        } else if (state.assigned_[sym] === false) {
          debugLog(`Symbol property was deleted, returning false`);
          return false;
        }
      }
      debugLog(`All properties match original values, returning true`);
      return true;
    }
    function checkParentStatus(parentState, childProp) {
      debugLog(`checkParentStatus called for child prop:`, childProp);
      const isReverted = checkIfReverted(parentState);
      debugLog(`Parent checkIfReverted returned:`, isReverted);
      if (isReverted) {
        debugLog(`Parent is fully reverted, clearing tracking`);
        parentState.modified = false;
        parentState.assigned_ = {};
        if (parentState.parent) {
          debugLog(`Continuing up the parent chain`);
          checkParentStatus(parentState.parent.tracker, parentState.parent.prop);
        }
      }
    }
    function createObjectProxy(obj) {
      debugLog(`createObjectProxy`, obj);
      if (proxyCache.has(obj)) {
        debugLog(`proxyCache found match`);
        return proxyCache.get(obj);
      }
      const proxy2 = new Proxy(obj, {
        get(ptarget, prop) {
          debugLog(`get`, ptarget, prop);
          const value = changeTracker.copy_[prop] ?? changeTracker.originalObject[prop];
          const originalValue = changeTracker.originalObject[prop];
          debugLog(`value (at top of proxy get)`, value);
          const desc = Object.getOwnPropertyDescriptor(ptarget, prop);
          if (desc?.get) {
            return value;
          }
          if (typeof value === `function`) {
            if (Array.isArray(ptarget)) {
              const methodName = prop.toString();
              if (ARRAY_MODIFYING_METHODS.has(methodName)) {
                return createModifyingMethodHandler(
                  value,
                  changeTracker,
                  markChanged
                );
              }
              const iterationHandler = createArrayIterationHandler(
                methodName,
                value,
                changeTracker,
                memoizedCreateChangeProxy
              );
              if (iterationHandler) {
                return iterationHandler;
              }
              if (prop === Symbol.iterator) {
                return createArrayIteratorHandler(
                  changeTracker,
                  memoizedCreateChangeProxy
                );
              }
            }
            if (ptarget instanceof Map || ptarget instanceof Set) {
              const methodName = prop.toString();
              if (MAP_SET_MODIFYING_METHODS.has(methodName)) {
                return createModifyingMethodHandler(
                  value,
                  changeTracker,
                  markChanged
                );
              }
              const iteratorHandler = createMapSetIteratorHandler(
                methodName,
                prop,
                value,
                ptarget,
                changeTracker,
                memoizedCreateChangeProxy,
                markChanged
              );
              if (iteratorHandler) {
                return iteratorHandler;
              }
            }
            return value.bind(ptarget);
          }
          if (isProxiableObject(value)) {
            const nestedParent = {
              tracker: changeTracker,
              prop: String(prop)
            };
            const { proxy: nestedProxy } = memoizedCreateChangeProxy(
              originalValue,
              nestedParent
            );
            proxyCache.set(value, nestedProxy);
            return nestedProxy;
          }
          return value;
        },
        set(_sobj, prop, value) {
          const currentValue = changeTracker.copy_[prop];
          debugLog(
            `set called for property ${String(prop)}, current:`,
            currentValue,
            `new:`,
            value
          );
          if (!deepEquals(currentValue, value)) {
            const originalValue = changeTracker.originalObject[prop];
            const isRevertToOriginal = deepEquals(value, originalValue);
            debugLog(
              `value:`,
              value,
              `original:`,
              originalValue,
              `isRevertToOriginal:`,
              isRevertToOriginal
            );
            if (isRevertToOriginal) {
              debugLog(`Reverting property ${String(prop)} to original value`);
              delete changeTracker.assigned_[prop.toString()];
              debugLog(`Updating copy with original value for ${String(prop)}`);
              changeTracker.copy_[prop] = deepClone(originalValue);
              debugLog(`Checking if all properties reverted`);
              const allReverted = checkIfReverted(changeTracker);
              debugLog(`All reverted:`, allReverted);
              if (allReverted) {
                debugLog(`All properties reverted, clearing tracking`);
                changeTracker.modified = false;
                changeTracker.assigned_ = {};
                if (parent) {
                  debugLog(`Updating parent for property:`, parent.prop);
                  checkParentStatus(parent.tracker, parent.prop);
                }
              } else {
                debugLog(`Some properties still changed, keeping modified flag`);
                changeTracker.modified = true;
              }
            } else {
              debugLog(`Setting new value for property ${String(prop)}`);
              changeTracker.copy_[prop] = value;
              changeTracker.assigned_[prop.toString()] = true;
              debugLog(`Marking object and ancestors as modified`, changeTracker);
              markChanged(changeTracker);
            }
          } else {
            debugLog(`Value unchanged, not tracking`);
          }
          return true;
        },
        defineProperty(ptarget, prop, descriptor) {
          const result = Reflect.defineProperty(ptarget, prop, descriptor);
          if (result && `value` in descriptor) {
            changeTracker.copy_[prop] = deepClone(descriptor.value);
            changeTracker.assigned_[prop.toString()] = true;
            markChanged(changeTracker);
          }
          return result;
        },
        getOwnPropertyDescriptor(ptarget, prop) {
          return Reflect.getOwnPropertyDescriptor(ptarget, prop);
        },
        preventExtensions(ptarget) {
          return Reflect.preventExtensions(ptarget);
        },
        isExtensible(ptarget) {
          return Reflect.isExtensible(ptarget);
        },
        deleteProperty(dobj, prop) {
          debugLog(`deleteProperty`, dobj, prop);
          const stringProp = typeof prop === `symbol` ? prop.toString() : prop;
          if (stringProp in dobj) {
            const hadPropertyInOriginal = stringProp in changeTracker.originalObject;
            const result = Reflect.deleteProperty(dobj, prop);
            if (result) {
              if (!hadPropertyInOriginal) {
                delete changeTracker.assigned_[stringProp];
                if (Object.keys(changeTracker.assigned_).length === 0 && Object.getOwnPropertySymbols(changeTracker.assigned_).length === 0) {
                  changeTracker.modified = false;
                } else {
                  changeTracker.modified = true;
                }
              } else {
                changeTracker.assigned_[stringProp] = false;
                markChanged(changeTracker);
              }
            }
            return result;
          }
          return true;
        }
      });
      proxyCache.set(obj, proxy2);
      return proxy2;
    }
    const proxy = createObjectProxy(changeTracker.copy_);
    return {
      proxy,
      getChanges: () => {
        debugLog(`getChanges called, modified:`, changeTracker.modified);
        debugLog(changeTracker);
        if (!changeTracker.modified) {
          debugLog(`Object not modified, returning empty object`);
          return {};
        }
        if (typeof changeTracker.copy_ !== `object` || Array.isArray(changeTracker.copy_)) {
          return changeTracker.copy_;
        }
        if (Object.keys(changeTracker.assigned_).length === 0) {
          return changeTracker.copy_;
        }
        const result = {};
        for (const key in changeTracker.copy_) {
          if (changeTracker.assigned_[key] === true && key in changeTracker.copy_) {
            result[key] = changeTracker.copy_[key];
          }
        }
        debugLog(`Returning copy:`, result);
        return result;
      }
    };
  }
  function createArrayChangeProxy(targets) {
    const proxiesWithChanges = targets.map((target) => createChangeProxy(target));
    return {
      proxies: proxiesWithChanges.map((p) => p.proxy),
      getChanges: () => proxiesWithChanges.map((p) => p.getChanges())
    };
  }
  function withChangeTracking(target, callback) {
    const { proxy, getChanges } = createChangeProxy(target);
    callback(proxy);
    return getChanges();
  }
  function withArrayChangeTracking(targets, callback) {
    const { proxies, getChanges } = createArrayChangeProxy(targets);
    callback(proxies);
    return getChanges();
  }

  function createDeferred() {
    let resolve;
    let reject;
    let isPending = true;
    const promise = new Promise((res, rej) => {
      resolve = (value) => {
        isPending = false;
        res(value);
      };
      reject = (reason) => {
        isPending = false;
        rej(reason);
      };
    });
    return {
      promise,
      resolve,
      reject,
      isPending: () => isPending
    };
  }

  function isPendingAwareJob(dep) {
    return typeof dep === `object` && dep !== null && typeof dep.hasPendingGraphRun === `function`;
  }
  class Scheduler {
    constructor() {
      this.contexts = /* @__PURE__ */ new Map();
      this.clearListeners = /* @__PURE__ */ new Set();
    }
    /**
     * Get or create the state bucket for a context.
     */
    getOrCreateContext(contextId) {
      let context = this.contexts.get(contextId);
      if (!context) {
        context = {
          queue: [],
          jobs: /* @__PURE__ */ new Map(),
          dependencies: /* @__PURE__ */ new Map(),
          completed: /* @__PURE__ */ new Set()
        };
        this.contexts.set(contextId, context);
      }
      return context;
    }
    /**
     * Schedule work. Without a context id, executes immediately.
     * Otherwise queues the job to be flushed once dependencies are satisfied.
     * Scheduling the same jobId again replaces the previous run function.
     */
    schedule({ contextId, jobId, dependencies, run }) {
      if (typeof contextId === `undefined`) {
        run();
        return;
      }
      const context = this.getOrCreateContext(contextId);
      if (!context.jobs.has(jobId)) {
        context.queue.push(jobId);
      }
      context.jobs.set(jobId, run);
      if (dependencies) {
        const depSet = new Set(dependencies);
        depSet.delete(jobId);
        context.dependencies.set(jobId, depSet);
      } else if (!context.dependencies.has(jobId)) {
        context.dependencies.set(jobId, /* @__PURE__ */ new Set());
      }
      context.completed.delete(jobId);
    }
    /**
     * Flush all queued work for a context. Jobs with unmet dependencies are retried.
     * Throws if a pass completes without running any job (dependency cycle).
     */
    flush(contextId) {
      const context = this.contexts.get(contextId);
      if (!context) return;
      const { queue, jobs, dependencies, completed } = context;
      while (queue.length > 0) {
        let ranThisPass = false;
        const jobsThisPass = queue.length;
        for (let i = 0; i < jobsThisPass; i++) {
          const jobId = queue.shift();
          const run = jobs.get(jobId);
          if (!run) {
            dependencies.delete(jobId);
            completed.delete(jobId);
            continue;
          }
          const deps = dependencies.get(jobId);
          let ready = !deps;
          if (deps) {
            ready = true;
            for (const dep of deps) {
              if (dep === jobId) continue;
              const depHasPending = isPendingAwareJob(dep) && dep.hasPendingGraphRun(contextId);
              if (jobs.has(dep) && !completed.has(dep) || !jobs.has(dep) && depHasPending) {
                ready = false;
                break;
              }
            }
          }
          if (ready) {
            jobs.delete(jobId);
            dependencies.delete(jobId);
            run();
            completed.add(jobId);
            ranThisPass = true;
          } else {
            queue.push(jobId);
          }
        }
        if (!ranThisPass) {
          throw new Error(
            `Scheduler detected unresolved dependencies for context ${String(
            contextId
          )}.`
          );
        }
      }
      this.contexts.delete(contextId);
    }
    /**
     * Flush all contexts with pending work. Useful during tear-down.
     */
    flushAll() {
      for (const contextId of Array.from(this.contexts.keys())) {
        this.flush(contextId);
      }
    }
    /** Clear all scheduled jobs for a context. */
    clear(contextId) {
      this.contexts.delete(contextId);
      this.clearListeners.forEach((listener) => listener(contextId));
    }
    /** Register a listener to be notified when a context is cleared. */
    onClear(listener) {
      this.clearListeners.add(listener);
      return () => this.clearListeners.delete(listener);
    }
    /** Check if a context has pending jobs. */
    hasPendingJobs(contextId) {
      const context = this.contexts.get(contextId);
      return !!context && context.jobs.size > 0;
    }
    /** Remove a single job from a context and clean up its dependencies. */
    clearJob(contextId, jobId) {
      const context = this.contexts.get(contextId);
      if (!context) return;
      context.jobs.delete(jobId);
      context.dependencies.delete(jobId);
      context.completed.delete(jobId);
      context.queue = context.queue.filter((id) => id !== jobId);
      if (context.jobs.size === 0) {
        this.contexts.delete(contextId);
      }
    }
  }
  const transactionScopedScheduler = new Scheduler();

  const transactions = [];
  let transactionStack = [];
  let sequenceNumber = 0;
  function mergePendingMutations(existing, incoming) {
    switch (`${existing.type}-${incoming.type}`) {
      case `insert-update`: {
        return {
          ...existing,
          type: `insert`,
          original: {},
          modified: incoming.modified,
          changes: { ...existing.changes, ...incoming.changes },
          // Keep existing keys (key changes not allowed in updates)
          key: existing.key,
          globalKey: existing.globalKey,
          // Merge metadata (last-write-wins)
          metadata: incoming.metadata ?? existing.metadata,
          syncMetadata: { ...existing.syncMetadata, ...incoming.syncMetadata },
          // Update tracking info
          mutationId: incoming.mutationId,
          updatedAt: incoming.updatedAt
        };
      }
      case `insert-delete`:
        return null;
      case `update-delete`:
        return incoming;
      case `update-update`: {
        return {
          ...incoming,
          // Keep original from first update
          original: existing.original,
          // Union the changes from both updates
          changes: { ...existing.changes, ...incoming.changes },
          // Merge metadata
          metadata: incoming.metadata ?? existing.metadata,
          syncMetadata: { ...existing.syncMetadata, ...incoming.syncMetadata }
        };
      }
      case `delete-delete`:
      case `insert-insert`:
        return incoming;
      default: {
        const _exhaustive = `${existing.type}-${incoming.type}`;
        throw new Error(`Unhandled mutation combination: ${_exhaustive}`);
      }
    }
  }
  function createTransaction(config) {
    const newTransaction = new Transaction(config);
    transactions.push(newTransaction);
    return newTransaction;
  }
  function getActiveTransaction() {
    if (transactionStack.length > 0) {
      return transactionStack.slice(-1)[0];
    } else {
      return void 0;
    }
  }
  function registerTransaction(tx) {
    transactionScopedScheduler.clear(tx.id);
    transactionStack.push(tx);
  }
  function unregisterTransaction(tx) {
    try {
      transactionScopedScheduler.flush(tx.id);
    } finally {
      transactionStack = transactionStack.filter((t) => t.id !== tx.id);
    }
  }
  function removeFromPendingList(tx) {
    const index = transactions.findIndex((t) => t.id === tx.id);
    if (index !== -1) {
      transactions.splice(index, 1);
    }
  }
  class Transaction {
    constructor(config) {
      if (typeof config.mutationFn === `undefined`) {
        throw new MissingMutationFunctionError();
      }
      this.id = config.id ?? safeRandomUUID();
      this.mutationFn = config.mutationFn;
      this.state = `pending`;
      this.mutations = [];
      this.isPersisted = createDeferred();
      this.autoCommit = config.autoCommit ?? true;
      this.createdAt = /* @__PURE__ */ new Date();
      this.sequenceNumber = sequenceNumber++;
      this.metadata = config.metadata ?? {};
    }
    setState(newState) {
      this.state = newState;
      if (newState === `completed` || newState === `failed`) {
        removeFromPendingList(this);
      }
    }
    /**
     * Execute collection operations within this transaction
     * @param callback - Synchronous function containing collection operations to group together.
     * The transaction context is active only for the synchronous duration of this callback.
     * Async work should happen in `mutationFn`; collection operations after `await` boundaries
     * inside this callback will not be part of this transaction. For manual transactions, call
     * `mutate` multiple times before committing to add more synchronous operations to the same
     * transaction.
     * @returns This transaction for chaining
     * @example
     * // Group multiple operations
     * const tx = createTransaction({ mutationFn: async () => {
     *   // Send to API
     * }})
     *
     * tx.mutate(() => {
     *   collection.insert({ id: "1", text: "Buy milk" })
     *   collection.update("2", draft => { draft.completed = true })
     *   collection.delete("3")
     * })
     *
     * await tx.isPersisted.promise
     *
     * @example
     * // Handle mutate errors
     * try {
     *   tx.mutate(() => {
     *     collection.insert({ id: "invalid" }) // This might throw
     *   })
     * } catch (error) {
     *   console.log('Mutation failed:', error)
     * }
     *
     * @example
     * // Manual commit control
     * const tx = createTransaction({ autoCommit: false, mutationFn: async () => {} })
     *
     * tx.mutate(() => {
     *   collection.insert({ id: "1", text: "Item" })
     * })
     *
     * // Add more synchronous mutations to the same transaction
     * tx.mutate(() => {
     *   collection.update("1", draft => { draft.text = "Updated item" })
     * })
     *
     * // Commit later when ready
     * await tx.commit()
     */
    mutate(callback) {
      if (this.state !== `pending`) {
        throw new TransactionNotPendingMutateError();
      }
      registerTransaction(this);
      try {
        callback();
      } finally {
        unregisterTransaction(this);
      }
      if (this.autoCommit) {
        this.commit().catch(() => {
        });
      }
      return this;
    }
    /**
     * Apply new mutations to this transaction, intelligently merging with existing mutations
     *
     * When mutations operate on the same item (same globalKey), they are merged according to
     * the following rules:
     *
     * - **insert + update** → insert (merge changes, keep empty original)
     * - **insert + delete** → removed (mutations cancel each other out)
     * - **update + delete** → delete (delete dominates)
     * - **update + update** → update (union changes, keep first original)
     * - **same type** → replace with latest
     *
     * This merging reduces over-the-wire churn and keeps the optimistic local view
     * aligned with user intent.
     *
     * @param mutations - Array of new mutations to apply
     */
    applyMutations(mutations) {
      const merged = /* @__PURE__ */ new Map();
      for (const mutation of this.mutations) {
        merged.set(mutation.globalKey, mutation);
      }
      for (const newMutation of mutations) {
        const existingMutation = merged.get(newMutation.globalKey);
        if (existingMutation) {
          const mergeResult = mergePendingMutations(existingMutation, newMutation);
          if (mergeResult === null) {
            merged.delete(newMutation.globalKey);
          } else {
            merged.set(newMutation.globalKey, mergeResult);
          }
        } else {
          merged.set(newMutation.globalKey, newMutation);
        }
      }
      this.mutations.length = 0;
      for (const mutation of merged.values()) {
        this.mutations.push(mutation);
      }
    }
    /**
     * Rollback the transaction and any conflicting transactions
     * @param config - Configuration for rollback behavior
     * @returns This transaction for chaining
     * @example
     * // Manual rollback
     * const tx = createTransaction({ mutationFn: async () => {
     *   // Send to API
     * }})
     *
     * tx.mutate(() => {
     *   collection.insert({ id: "1", text: "Buy milk" })
     * })
     *
     * // Rollback if needed
     * if (shouldCancel) {
     *   tx.rollback()
     * }
     *
     * @example
     * // Handle rollback cascade (automatic)
     * const tx1 = createTransaction({ mutationFn: async () => {} })
     * const tx2 = createTransaction({ mutationFn: async () => {} })
     *
     * tx1.mutate(() => collection.update("1", draft => { draft.value = "A" }))
     * tx2.mutate(() => collection.update("1", draft => { draft.value = "B" })) // Same item
     *
     * tx1.rollback() // This will also rollback tx2 due to conflict
     *
     * @example
     * // Handle rollback in error scenarios
     * try {
     *   await tx.isPersisted.promise
     * } catch (error) {
     *   console.log('Transaction was rolled back:', error)
     *   // Transaction automatically rolled back on mutation function failure
     * }
     */
    rollback(config) {
      const isSecondaryRollback = config?.isSecondaryRollback ?? false;
      if (this.state === `completed`) {
        throw new TransactionAlreadyCompletedRollbackError();
      }
      this.setState(`failed`);
      if (!isSecondaryRollback) {
        const mutationIds = /* @__PURE__ */ new Set();
        this.mutations.forEach((m) => mutationIds.add(m.globalKey));
        for (const t of transactions) {
          t.state === `pending` && t.mutations.some((m) => mutationIds.has(m.globalKey)) && t.rollback({ isSecondaryRollback: true });
        }
      }
      this.isPersisted.reject(this.error?.error);
      this.touchCollection();
      return this;
    }
    // Tell collection that something has changed with the transaction
    touchCollection() {
      const hasCalled = /* @__PURE__ */ new Set();
      for (const mutation of this.mutations) {
        if (!hasCalled.has(mutation.collection.id)) {
          mutation.collection._state.onTransactionStateChange();
          if (mutation.collection._state.pendingSyncedTransactions.length > 0) {
            mutation.collection._state.commitPendingTransactions();
          }
          hasCalled.add(mutation.collection.id);
        }
      }
    }
    /**
     * Commit the transaction and execute the mutation function
     * @returns Promise that resolves to this transaction when complete
     * @example
     * // Manual commit (when autoCommit is false)
     * const tx = createTransaction({
     *   autoCommit: false,
     *   mutationFn: async ({ transaction }) => {
     *     await api.saveChanges(transaction.mutations)
     *   }
     * })
     *
     * tx.mutate(() => {
     *   collection.insert({ id: "1", text: "Buy milk" })
     * })
     *
     * await tx.commit() // Manually commit
     *
     * @example
     * // Handle commit errors
     * try {
     *   const tx = createTransaction({
     *     mutationFn: async () => { throw new Error("API failed") }
     *   })
     *
     *   tx.mutate(() => {
     *     collection.insert({ id: "1", text: "Item" })
     *   })
     *
     *   await tx.commit()
     * } catch (error) {
     *   console.log('Commit failed, transaction rolled back:', error)
     * }
     *
     * @example
     * // Check transaction state after commit
     * await tx.commit()
     * console.log(tx.state) // "completed" or "failed"
     */
    async commit() {
      if (this.state !== `pending`) {
        throw new TransactionNotPendingCommitError();
      }
      this.setState(`persisting`);
      if (this.mutations.length === 0) {
        this.setState(`completed`);
        this.isPersisted.resolve(this);
        return this;
      }
      try {
        await this.mutationFn({
          transaction: this
        });
        this.setState(`completed`);
        this.touchCollection();
        this.isPersisted.resolve(this);
      } catch (error) {
        const originalError = error instanceof Error ? error : new Error(String(error));
        this.error = {
          message: originalError.message,
          error: originalError
        };
        this.rollback();
        throw originalError;
      }
      return this;
    }
    /**
     * Compare two transactions by their createdAt time and sequence number in order
     * to sort them in the order they were created.
     * @param other - The other transaction to compare to
     * @returns -1 if this transaction was created before the other, 1 if it was created after, 0 if they were created at the same time
     */
    compareCreatedAt(other) {
      const createdAtComparison = this.createdAt.getTime() - other.createdAt.getTime();
      if (createdAtComparison !== 0) {
        return createdAtComparison;
      }
      return this.sequenceNumber - other.sequenceNumber;
    }
  }

  class CollectionMutationsManager {
    constructor(config, id) {
      this.insert = (data, config2) => {
        this.lifecycle.validateCollectionUsable(`insert`);
        const state = this.state;
        const ambientTransaction = getActiveTransaction();
        if (!ambientTransaction && !this.config.onInsert) {
          throw new MissingInsertHandlerError();
        }
        const items = Array.isArray(data) ? data : [data];
        const mutations = [];
        const keysInCurrentBatch = /* @__PURE__ */ new Set();
        items.forEach((item) => {
          const validatedData = this.validateData(item, `insert`);
          const key = this.config.getKey(validatedData);
          if (this.state.has(key) || keysInCurrentBatch.has(key)) {
            throw new DuplicateKeyError(key);
          }
          keysInCurrentBatch.add(key);
          const globalKey = this.generateGlobalKey(key, item);
          const mutation = {
            mutationId: safeRandomUUID(),
            original: {},
            modified: validatedData,
            // Pick the values from validatedData based on what's passed in - this is for cases
            // where a schema has default values. The validated data has the extra default
            // values but for changes, we just want to show the data that was actually passed in.
            changes: Object.fromEntries(
              Object.keys(item).map((k) => [
                k,
                validatedData[k]
              ])
            ),
            globalKey,
            key,
            metadata: config2?.metadata,
            syncMetadata: this.config.sync.getSyncMetadata?.() || {},
            optimistic: config2?.optimistic ?? true,
            type: `insert`,
            createdAt: /* @__PURE__ */ new Date(),
            updatedAt: /* @__PURE__ */ new Date(),
            collection: this.collection
          };
          mutations.push(mutation);
        });
        if (ambientTransaction) {
          ambientTransaction.applyMutations(mutations);
          state.transactions.set(ambientTransaction.id, ambientTransaction);
          state.scheduleTransactionCleanup(ambientTransaction);
          state.recomputeOptimisticState(true);
          return ambientTransaction;
        } else {
          const directOpTransaction = createTransaction({
            metadata: { [DIRECT_TRANSACTION_METADATA_KEY]: true },
            mutationFn: async (params) => {
              return await this.config.onInsert({
                transaction: params.transaction,
                collection: this.collection
              });
            }
          });
          directOpTransaction.applyMutations(mutations);
          this.markPendingLocalOrigins(mutations);
          directOpTransaction.commit().catch(() => void 0);
          state.transactions.set(directOpTransaction.id, directOpTransaction);
          state.scheduleTransactionCleanup(directOpTransaction);
          state.recomputeOptimisticState(true);
          return directOpTransaction;
        }
      };
      this.delete = (keys, config2) => {
        const state = this.state;
        this.lifecycle.validateCollectionUsable(`delete`);
        const ambientTransaction = getActiveTransaction();
        if (!ambientTransaction && !this.config.onDelete) {
          throw new MissingDeleteHandlerError();
        }
        if (Array.isArray(keys) && keys.length === 0) {
          throw new NoKeysPassedToDeleteError();
        }
        const keysArray = Array.isArray(keys) ? keys : [keys];
        const mutations = [];
        for (const key of keysArray) {
          if (!this.state.has(key)) {
            throw new DeleteKeyNotFoundError(key);
          }
          const globalKey = this.generateGlobalKey(key, this.state.get(key));
          const mutation = {
            mutationId: safeRandomUUID(),
            original: this.state.get(key),
            modified: this.state.get(key),
            changes: this.state.get(key),
            globalKey,
            key,
            metadata: config2?.metadata,
            syncMetadata: state.syncedMetadata.get(key) || {},
            optimistic: config2?.optimistic ?? true,
            type: `delete`,
            createdAt: /* @__PURE__ */ new Date(),
            updatedAt: /* @__PURE__ */ new Date(),
            collection: this.collection
          };
          mutations.push(mutation);
        }
        if (ambientTransaction) {
          ambientTransaction.applyMutations(mutations);
          state.transactions.set(ambientTransaction.id, ambientTransaction);
          state.scheduleTransactionCleanup(ambientTransaction);
          state.recomputeOptimisticState(true);
          return ambientTransaction;
        }
        const directOpTransaction = createTransaction({
          autoCommit: true,
          metadata: { [DIRECT_TRANSACTION_METADATA_KEY]: true },
          mutationFn: async (params) => {
            return this.config.onDelete({
              transaction: params.transaction,
              collection: this.collection
            });
          }
        });
        directOpTransaction.applyMutations(mutations);
        this.markPendingLocalOrigins(mutations);
        directOpTransaction.commit().catch(() => void 0);
        state.transactions.set(directOpTransaction.id, directOpTransaction);
        state.scheduleTransactionCleanup(directOpTransaction);
        state.recomputeOptimisticState(true);
        return directOpTransaction;
      };
      this.id = id;
      this.config = config;
    }
    setDeps(deps) {
      this.lifecycle = deps.lifecycle;
      this.state = deps.state;
      this.collection = deps.collection;
    }
    ensureStandardSchema(schema) {
      if (schema && `~standard` in schema) {
        return schema;
      }
      throw new InvalidSchemaError();
    }
    validateData(data, type, key) {
      if (!this.config.schema) return data;
      const standardSchema = this.ensureStandardSchema(this.config.schema);
      if (type === `update` && key) {
        const existingData = this.state.get(key);
        if (existingData && data && typeof data === `object` && typeof existingData === `object`) {
          const mergedData = Object.assign({}, existingData, data);
          const result2 = standardSchema[`~standard`].validate(mergedData);
          if (result2 instanceof Promise) {
            throw new SchemaMustBeSynchronousError();
          }
          if (`issues` in result2 && result2.issues) {
            const typedIssues = result2.issues.map((issue) => ({
              message: issue.message,
              path: issue.path?.map((p) => String(p))
            }));
            throw new SchemaValidationError(type, typedIssues);
          }
          const validatedMergedData = result2.value;
          const modifiedKeys = Object.keys(data);
          const extractedChanges = Object.fromEntries(
            modifiedKeys.map((k) => [k, validatedMergedData[k]])
          );
          return extractedChanges;
        }
      }
      const result = standardSchema[`~standard`].validate(data);
      if (result instanceof Promise) {
        throw new SchemaMustBeSynchronousError();
      }
      if (`issues` in result && result.issues) {
        const typedIssues = result.issues.map((issue) => ({
          message: issue.message,
          path: issue.path?.map((p) => String(p))
        }));
        throw new SchemaValidationError(type, typedIssues);
      }
      return result.value;
    }
    generateGlobalKey(key, item) {
      if (typeof key !== `string` && typeof key !== `number`) {
        if (typeof key === `undefined`) {
          throw new UndefinedKeyError(item);
        }
        throw new InvalidKeyError(key, item);
      }
      return `KEY::${this.id}/${key}`;
    }
    markPendingLocalOrigins(mutations) {
      for (const mutation of mutations) {
        this.state.pendingLocalOrigins.add(mutation.key);
      }
    }
    /**
     * Updates one or more items in the collection using a callback function
     */
    update(keys, configOrCallback, maybeCallback) {
      if (typeof keys === `undefined`) {
        throw new MissingUpdateArgumentError();
      }
      const state = this.state;
      this.lifecycle.validateCollectionUsable(`update`);
      const ambientTransaction = getActiveTransaction();
      if (!ambientTransaction && !this.config.onUpdate) {
        throw new MissingUpdateHandlerError();
      }
      const isArray = Array.isArray(keys);
      const keysArray = isArray ? keys : [keys];
      if (isArray && keysArray.length === 0) {
        throw new NoKeysPassedToUpdateError();
      }
      const callback = typeof configOrCallback === `function` ? configOrCallback : maybeCallback;
      const config = typeof configOrCallback === `function` ? {} : configOrCallback;
      const currentObjects = keysArray.map((key) => {
        const item = this.state.get(key);
        if (!item) {
          throw new UpdateKeyNotFoundError(key);
        }
        return item;
      });
      let changesArray;
      if (isArray) {
        changesArray = withArrayChangeTracking(
          currentObjects,
          callback
        );
      } else {
        const result = withChangeTracking(
          currentObjects[0],
          callback
        );
        changesArray = [result];
      }
      const mutations = keysArray.map((key, index) => {
        const itemChanges = changesArray[index];
        if (!itemChanges || Object.keys(itemChanges).length === 0) {
          return null;
        }
        const originalItem = currentObjects[index];
        const validatedUpdatePayload = this.validateData(
          itemChanges,
          `update`,
          key
        );
        const modifiedItem = Object.assign(
          {},
          originalItem,
          validatedUpdatePayload
        );
        const originalItemId = this.config.getKey(originalItem);
        const modifiedItemId = this.config.getKey(modifiedItem);
        if (originalItemId !== modifiedItemId) {
          throw new KeyUpdateNotAllowedError(originalItemId, modifiedItemId);
        }
        const globalKey = this.generateGlobalKey(modifiedItemId, modifiedItem);
        return {
          mutationId: safeRandomUUID(),
          original: originalItem,
          modified: modifiedItem,
          // Pick the values from modifiedItem based on what's passed in - this is for cases
          // where a schema has default values or transforms. The modified data has the extra
          // default or transformed values but for changes, we just want to show the data that
          // was actually passed in.
          changes: Object.fromEntries(
            Object.keys(itemChanges).map((k) => [
              k,
              modifiedItem[k]
            ])
          ),
          globalKey,
          key,
          metadata: config.metadata,
          syncMetadata: state.syncedMetadata.get(key) || {},
          optimistic: config.optimistic ?? true,
          type: `update`,
          createdAt: /* @__PURE__ */ new Date(),
          updatedAt: /* @__PURE__ */ new Date(),
          collection: this.collection
        };
      }).filter(Boolean);
      if (mutations.length === 0) {
        const emptyTransaction = createTransaction({
          mutationFn: async () => {
          }
        });
        emptyTransaction.commit().catch(() => void 0);
        state.scheduleTransactionCleanup(emptyTransaction);
        return emptyTransaction;
      }
      if (ambientTransaction) {
        ambientTransaction.applyMutations(mutations);
        state.transactions.set(ambientTransaction.id, ambientTransaction);
        state.scheduleTransactionCleanup(ambientTransaction);
        state.recomputeOptimisticState(true);
        return ambientTransaction;
      }
      const directOpTransaction = createTransaction({
        metadata: { [DIRECT_TRANSACTION_METADATA_KEY]: true },
        mutationFn: async (params) => {
          return this.config.onUpdate({
            transaction: params.transaction,
            collection: this.collection
          });
        }
      });
      directOpTransaction.applyMutations(mutations);
      this.markPendingLocalOrigins(mutations);
      directOpTransaction.commit().catch(() => void 0);
      state.transactions.set(directOpTransaction.id, directOpTransaction);
      state.scheduleTransactionCleanup(directOpTransaction);
      state.recomputeOptimisticState(true);
      return directOpTransaction;
    }
  }

  class CollectionEventsManager extends EventEmitter {
    constructor() {
      super();
    }
    setDeps(deps) {
      this.collection = deps.collection;
    }
    /**
     * Emit an event to all listeners
     * Public API for emitting collection events
     */
    emit(event, eventPayload) {
      this.emitInner(event, eventPayload);
    }
    emitStatusChange(status, previousStatus) {
      this.emit(`status:change`, {
        type: `status:change`,
        collection: this.collection,
        previousStatus,
        status
      });
      const eventKey = `status:${status}`;
      this.emit(eventKey, {
        type: eventKey,
        collection: this.collection,
        previousStatus,
        status
      });
    }
    emitSubscribersChange(subscriberCount, previousSubscriberCount) {
      this.emit(`subscribers:change`, {
        type: `subscribers:change`,
        collection: this.collection,
        previousSubscriberCount,
        subscriberCount
      });
    }
    emitIndexAdded(index) {
      this.emit(`index:added`, {
        type: `index:added`,
        collection: this.collection,
        index
      });
    }
    emitIndexRemoved(index) {
      this.emit(`index:removed`, {
        type: `index:removed`,
        collection: this.collection,
        index
      });
    }
    cleanup() {
      this.clearListeners();
    }
  }

  function createCollection(options) {
    const collection = new CollectionImpl(
      options
    );
    if (options.utils) {
      collection.utils = options.utils;
    } else {
      collection.utils = {};
    }
    return collection;
  }
  class CollectionImpl {
    /**
     * Creates a new Collection instance
     *
     * @param config - Configuration object for the collection
     * @throws Error if sync config is missing
     */
    constructor(config) {
      this.utils = {};
      this.deferDataRefresh = null;
      this.insert = (data, config2) => {
        return this._mutations.insert(data, config2);
      };
      this.delete = (keys, config2) => {
        return this._mutations.delete(keys, config2);
      };
      if (!config) {
        throw new CollectionRequiresConfigError();
      }
      if (!config.sync) {
        throw new CollectionRequiresSyncConfigError();
      }
      if (config.id) {
        this.id = config.id;
      } else {
        this.id = safeRandomUUID();
      }
      this.config = {
        ...config,
        autoIndex: config.autoIndex ?? `off`
      };
      if (this.config.autoIndex === `eager` && !config.defaultIndexType) {
        throw new CollectionConfigurationError(
          `autoIndex: 'eager' requires defaultIndexType to be set. Import an index type and set it:
  import { BasicIndex } from '@tanstack/db'
  createCollection({ defaultIndexType: BasicIndex, autoIndex: 'eager', ... })`
        );
      }
      this._changes = new CollectionChangesManager();
      this._events = new CollectionEventsManager();
      this._indexes = new CollectionIndexesManager();
      this._lifecycle = new CollectionLifecycleManager(config, this.id);
      this._mutations = new CollectionMutationsManager(config, this.id);
      this._state = new CollectionStateManager(config);
      this._sync = new CollectionSyncManager(config, this.id);
      this.comparisonOpts = buildCompareOptionsFromConfig(config);
      this._changes.setDeps({
        collection: this,
        // Required for passing to CollectionSubscription
        lifecycle: this._lifecycle,
        sync: this._sync,
        events: this._events,
        state: this._state
        // Required for enriching changes with virtual properties
      });
      this._events.setDeps({
        collection: this
        // Required for adding to emitted events
      });
      this._indexes.setDeps({
        state: this._state,
        lifecycle: this._lifecycle,
        defaultIndexType: config.defaultIndexType,
        events: this._events
      });
      this._lifecycle.setDeps({
        changes: this._changes,
        events: this._events,
        indexes: this._indexes,
        state: this._state,
        sync: this._sync
      });
      this._mutations.setDeps({
        collection: this,
        // Required for passing to config.onInsert/onUpdate/onDelete and annotating mutations
        lifecycle: this._lifecycle,
        state: this._state
      });
      this._state.setDeps({
        collection: this,
        // Required for filtering events to only include this collection
        lifecycle: this._lifecycle,
        changes: this._changes,
        indexes: this._indexes,
        events: this._events
      });
      this._sync.setDeps({
        collection: this,
        // Required for passing to config.sync callback
        state: this._state,
        lifecycle: this._lifecycle,
        events: this._events
      });
      if (config.startSync === true) {
        this._sync.startSync();
      }
    }
    /**
     * Gets the current status of the collection
     */
    get status() {
      return this._lifecycle.status;
    }
    /**
     * Get the number of subscribers to the collection
     */
    get subscriberCount() {
      return this._changes.activeSubscribersCount;
    }
    /**
     * Register a callback to be executed when the collection first becomes ready
     * Useful for preloading collections
     * @param callback Function to call when the collection first becomes ready
     * @example
     * collection.onFirstReady(() => {
     *   console.log('Collection is ready for the first time')
     *   // Safe to access collection.state now
     * })
     */
    onFirstReady(callback) {
      return this._lifecycle.onFirstReady(callback);
    }
    /**
     * Check if the collection is ready for use
     * Returns true if the collection has been marked as ready by its sync implementation
     * @returns true if the collection is ready, false otherwise
     * @example
     * if (collection.isReady()) {
     *   console.log('Collection is ready, data is available')
     *   // Safe to access collection.state
     * } else {
     *   console.log('Collection is still loading')
     * }
     */
    isReady() {
      return this._lifecycle.status === `ready`;
    }
    /**
     * Check if the collection is currently loading more data
     * @returns true if the collection has pending load more operations, false otherwise
     */
    get isLoadingSubset() {
      return this._sync.isLoadingSubset;
    }
    /**
     * Start sync immediately - internal method for compiled queries
     * This bypasses lazy loading for special cases like live query results
     */
    startSyncImmediate() {
      this._sync.startSync();
    }
    /**
     * Preload the collection data by starting sync if not already started
     * Multiple concurrent calls will share the same promise
     */
    preload() {
      return this._sync.preload();
    }
    /**
     * Get the current value for a key (virtual derived state)
     */
    get(key) {
      return this._state.getWithVirtualProps(key);
    }
    /**
     * Check if a key exists in the collection (virtual derived state)
     */
    has(key) {
      return this._state.has(key);
    }
    /**
     * Get the current size of the collection (cached)
     */
    get size() {
      return this._state.size;
    }
    /**
     * Get all keys (virtual derived state)
     */
    *keys() {
      yield* this._state.keys();
    }
    /**
     * Get all values (virtual derived state)
     */
    *values() {
      for (const key of this._state.keys()) {
        const value = this.get(key);
        if (value !== void 0) {
          yield value;
        }
      }
    }
    /**
     * Get all entries (virtual derived state)
     */
    *entries() {
      for (const key of this._state.keys()) {
        const value = this.get(key);
        if (value !== void 0) {
          yield [key, value];
        }
      }
    }
    /**
     * Get all entries (virtual derived state)
     */
    *[Symbol.iterator]() {
      yield* this.entries();
    }
    /**
     * Execute a callback for each entry in the collection
     */
    forEach(callbackfn) {
      let index = 0;
      for (const [key, value] of this.entries()) {
        callbackfn(value, key, index++);
      }
    }
    /**
     * Create a new array with the results of calling a function for each entry in the collection
     */
    map(callbackfn) {
      const result = [];
      let index = 0;
      for (const [key, value] of this.entries()) {
        result.push(callbackfn(value, key, index++));
      }
      return result;
    }
    getKeyFromItem(item) {
      return this.config.getKey(item);
    }
    /**
     * Creates an index on a collection for faster queries.
     * Indexes significantly improve query performance by allowing constant time lookups
     * and logarithmic time range queries instead of full scans.
     *
     * @param indexCallback - Function that extracts the indexed value from each item
     * @param config - Configuration including index type and type-specific options
     * @returns The created index
     *
     * @example
     * ```ts
     * import { BasicIndex } from '@tanstack/db'
     *
     * // Create an index with explicit type
     * const ageIndex = collection.createIndex((row) => row.age, {
     *   indexType: BasicIndex
     * })
     *
     * // Create an index with collection's default type
     * const nameIndex = collection.createIndex((row) => row.name)
     * ```
     */
    createIndex(indexCallback, config = {}) {
      return this._indexes.createIndex(indexCallback, config);
    }
    /**
     * Removes an index created with createIndex.
     * Returns true when an index existed and was removed.
     *
     * Best-effort semantics: removing an index guarantees it is detached from
     * collection query planning. Existing index proxy references should be treated
     * as invalid after removal.
     */
    removeIndex(indexOrId) {
      return this._indexes.removeIndex(indexOrId);
    }
    /**
     * Returns a snapshot of current index metadata sorted by indexId.
     * Persistence wrappers can use this to bootstrap index state if indexes were
     * created before event listeners were attached.
     */
    getIndexMetadata() {
      return this._indexes.getIndexMetadataSnapshot();
    }
    /**
     * Get resolved indexes for query optimization
     */
    get indexes() {
      return this._indexes.indexes;
    }
    /**
     * Validates the data against the schema
     */
    validateData(data, type, key) {
      return this._mutations.validateData(data, type, key);
    }
    get compareOptions() {
      return { ...this.comparisonOpts };
    }
    update(keys, configOrCallback, maybeCallback) {
      return this._mutations.update(keys, configOrCallback, maybeCallback);
    }
    /**
     * Gets the current state of the collection as a Map
     * @returns Map containing all items in the collection, with keys as identifiers
     * @example
     * const itemsMap = collection.state
     * console.log(`Collection has ${itemsMap.size} items`)
     *
     * for (const [key, item] of itemsMap) {
     *   console.log(`${key}: ${item.title}`)
     * }
     *
     * // Check if specific item exists
     * if (itemsMap.has("todo-1")) {
     *   console.log("Todo 1 exists:", itemsMap.get("todo-1"))
     * }
     */
    get state() {
      const result = /* @__PURE__ */ new Map();
      for (const [key, value] of this.entries()) {
        result.set(key, value);
      }
      return result;
    }
    /**
     * Gets the current state of the collection as a Map, but only resolves when data is available
     * Waits for the first sync commit to complete before resolving
     *
     * @returns Promise that resolves to a Map containing all items in the collection
     */
    stateWhenReady() {
      if (this.size > 0 || this.isReady()) {
        return Promise.resolve(this.state);
      }
      return this.preload().then(() => this.state);
    }
    /**
     * Gets the current state of the collection as an Array
     *
     * @returns An Array containing all items in the collection
     */
    get toArray() {
      return Array.from(this.values());
    }
    /**
     * Gets the current state of the collection as an Array, but only resolves when data is available
     * Waits for the first sync commit to complete before resolving
     *
     * @returns Promise that resolves to an Array containing all items in the collection
     */
    toArrayWhenReady() {
      if (this.size > 0 || this.isReady()) {
        return Promise.resolve(this.toArray);
      }
      return this.preload().then(() => this.toArray);
    }
    /**
     * Returns the current state of the collection as an array of changes
     * @param options - Options including optional where filter
     * @returns An array of changes
     * @example
     * // Get all items as changes
     * const allChanges = collection.currentStateAsChanges()
     *
     * // Get only items matching a condition
     * const activeChanges = collection.currentStateAsChanges({
     *   where: (row) => row.status === 'active'
     * })
     *
     * // Get only items using a pre-compiled expression
     * const activeChanges = collection.currentStateAsChanges({
     *   whereExpression: eq(row.status, 'active')
     * })
     */
    currentStateAsChanges(options = {}) {
      return currentStateAsChanges(this, options);
    }
    /**
     * Subscribe to changes in the collection
     * @param callback - Function called when items change
     * @param options - Subscription options including includeInitialState and where filter
     * @returns Unsubscribe function - Call this to stop listening for changes
     * @example
     * // Basic subscription
     * const subscription = collection.subscribeChanges((changes) => {
     *   changes.forEach(change => {
     *     console.log(`${change.type}: ${change.key}`, change.value)
     *   })
     * })
     *
     * // Later: subscription.unsubscribe()
     *
     * @example
     * // Include current state immediately
     * const subscription = collection.subscribeChanges((changes) => {
     *   updateUI(changes)
     * }, { includeInitialState: true })
     *
     * @example
     * // Subscribe only to changes matching a condition using where callback
     * import { eq } from "@tanstack/db"
     *
     * const subscription = collection.subscribeChanges((changes) => {
     *   updateUI(changes)
     * }, {
     *   includeInitialState: true,
     *   where: (row) => eq(row.status, "active")
     * })
     *
     * @example
     * // Using multiple conditions with and()
     * import { and, eq, gt } from "@tanstack/db"
     *
     * const subscription = collection.subscribeChanges((changes) => {
     *   updateUI(changes)
     * }, {
     *   where: (row) => and(eq(row.status, "active"), gt(row.priority, 5))
     * })
     */
    subscribeChanges(callback, options = {}) {
      return this._changes.subscribeChanges(callback, options);
    }
    /**
     * Subscribe to a collection event
     */
    on(event, callback) {
      return this._events.on(event, callback);
    }
    /**
     * Subscribe to a collection event once
     */
    once(event, callback) {
      return this._events.once(event, callback);
    }
    /**
     * Unsubscribe from a collection event
     */
    off(event, callback) {
      this._events.off(event, callback);
    }
    /**
     * Wait for a collection event
     */
    waitFor(event, timeout) {
      return this._events.waitFor(event, timeout);
    }
    /**
     * Clean up the collection by stopping sync and clearing data
     * This can be called manually or automatically by garbage collection
     */
    async cleanup() {
      this._lifecycle.cleanup();
      return Promise.resolve();
    }
  }
  function buildCompareOptionsFromConfig(config) {
    if (config.defaultStringCollation) {
      const options = config.defaultStringCollation;
      return {
        stringSort: options.stringSort ?? `locale`,
        locale: options.stringSort === `locale` ? options.locale : void 0,
        localeOptions: options.stringSort === `locale` ? options.localeOptions : void 0
      };
    } else {
      return {
        stringSort: `locale`
      };
    }
  }

  const DEFAULT_SYNC_INTERVAL = 3e4;
  function dataverseCollectionOptions(config) {
    const { table, syncInterval = DEFAULT_SYNC_INTERVAL, ...rest } = config;
    const pk = table.primaryKey;
    const getKey = (item) => item[pk.key];
    const collectionId = table.entitySetName;
    let pollTimer = null;
    let syncFn = null;
    const defaultOnInsert = async ({ transaction }) => {
      const results = [];
      for (const mutation of transaction.mutations) {
        const guid = await table.createRecord(mutation.modified);
        results.push(guid);
      }
      return results;
    };
    const defaultOnUpdate = async ({ transaction }) => {
      const results = [];
      for (const mutation of transaction.mutations) {
        await table.updateRecord(mutation.key, mutation.changes);
        results.push(mutation.key);
      }
      return results;
    };
    const defaultOnDelete = async ({ transaction }) => {
      const results = [];
      for (const mutation of transaction.mutations) {
        await table.deleteRecord(mutation.key);
        results.push(mutation.key);
      }
      return results;
    };
    const syncConfig = {
      sync: ({ begin, write, commit, markReady, collection }) => {
        syncFn = async () => {
          try {
            const keysToDelete = new Set(collection.keys());
            begin();
            for await (const record of table.iterateRecords()) {
              const key = table.getPrimaryId(record);
              const existingRecord = collection.get(key);
              if (existingRecord) {
                if (getEtag(record) !== getEtag(existingRecord)) {
                  write({ type: "update", value: record });
                }
                keysToDelete.delete(key);
              } else {
                write({ type: "insert", value: record });
              }
            }
            for (const key of keysToDelete) {
              write({ type: "delete", value: collection.get(key) });
            }
            commit();
          } catch (err) {
            console.warn(`[dataverse-collection] sync failed for "${collectionId}":`, err);
          } finally {
            markReady();
          }
        };
        syncFn();
        pollTimer = setInterval(() => {
          syncFn?.();
        }, syncInterval);
        return () => {
          if (pollTimer) {
            clearInterval(pollTimer);
            pollTimer = null;
          }
        };
      },
      rowUpdateMode: "partial"
    };
    const utils = {
      forceSync: async () => {
        await syncFn?.();
      },
      table
    };
    return {
      ...rest,
      id: collectionId,
      getKey,
      sync: syncConfig,
      onInsert: defaultOnInsert,
      onUpdate: defaultOnUpdate,
      onDelete: defaultOnDelete,
      utils
    };
  }

  const instanceOfAny = (object, constructors) => constructors.some((c) => object instanceof c);

  let idbProxyableTypes;
  let cursorAdvanceMethods;
  // This is a function to prevent it throwing up in node environments.
  function getIdbProxyableTypes() {
      return (idbProxyableTypes ||
          (idbProxyableTypes = [
              IDBDatabase,
              IDBObjectStore,
              IDBIndex,
              IDBCursor,
              IDBTransaction,
          ]));
  }
  // This is a function to prevent it throwing up in node environments.
  function getCursorAdvanceMethods() {
      return (cursorAdvanceMethods ||
          (cursorAdvanceMethods = [
              IDBCursor.prototype.advance,
              IDBCursor.prototype.continue,
              IDBCursor.prototype.continuePrimaryKey,
          ]));
  }
  const transactionDoneMap = new WeakMap();
  const transformCache = new WeakMap();
  const reverseTransformCache = new WeakMap();
  function promisifyRequest(request) {
      const promise = new Promise((resolve, reject) => {
          const unlisten = () => {
              request.removeEventListener('success', success);
              request.removeEventListener('error', error);
          };
          const success = () => {
              resolve(wrap(request.result));
              unlisten();
          };
          const error = () => {
              reject(request.error);
              unlisten();
          };
          request.addEventListener('success', success);
          request.addEventListener('error', error);
      });
      // This mapping exists in reverseTransformCache but doesn't exist in transformCache. This
      // is because we create many promises from a single IDBRequest.
      reverseTransformCache.set(promise, request);
      return promise;
  }
  function cacheDonePromiseForTransaction(tx) {
      // Early bail if we've already created a done promise for this transaction.
      if (transactionDoneMap.has(tx))
          return;
      const done = new Promise((resolve, reject) => {
          const unlisten = () => {
              tx.removeEventListener('complete', complete);
              tx.removeEventListener('error', error);
              tx.removeEventListener('abort', error);
          };
          const complete = () => {
              resolve();
              unlisten();
          };
          const error = () => {
              reject(tx.error || new DOMException('AbortError', 'AbortError'));
              unlisten();
          };
          tx.addEventListener('complete', complete);
          tx.addEventListener('error', error);
          tx.addEventListener('abort', error);
      });
      // Cache it for later retrieval.
      transactionDoneMap.set(tx, done);
  }
  let idbProxyTraps = {
      get(target, prop, receiver) {
          if (target instanceof IDBTransaction) {
              // Special handling for transaction.done.
              if (prop === 'done')
                  return transactionDoneMap.get(target);
              // Make tx.store return the only store in the transaction, or undefined if there are many.
              if (prop === 'store') {
                  return receiver.objectStoreNames[1]
                      ? undefined
                      : receiver.objectStore(receiver.objectStoreNames[0]);
              }
          }
          // Else transform whatever we get back.
          return wrap(target[prop]);
      },
      set(target, prop, value) {
          target[prop] = value;
          return true;
      },
      has(target, prop) {
          if (target instanceof IDBTransaction &&
              (prop === 'done' || prop === 'store')) {
              return true;
          }
          return prop in target;
      },
  };
  function replaceTraps(callback) {
      idbProxyTraps = callback(idbProxyTraps);
  }
  function wrapFunction(func) {
      // Due to expected object equality (which is enforced by the caching in `wrap`), we
      // only create one new func per func.
      // Cursor methods are special, as the behaviour is a little more different to standard IDB. In
      // IDB, you advance the cursor and wait for a new 'success' on the IDBRequest that gave you the
      // cursor. It's kinda like a promise that can resolve with many values. That doesn't make sense
      // with real promises, so each advance methods returns a new promise for the cursor object, or
      // undefined if the end of the cursor has been reached.
      if (getCursorAdvanceMethods().includes(func)) {
          return function (...args) {
              // Calling the original function with the proxy as 'this' causes ILLEGAL INVOCATION, so we use
              // the original object.
              func.apply(unwrap(this), args);
              return wrap(this.request);
          };
      }
      return function (...args) {
          // Calling the original function with the proxy as 'this' causes ILLEGAL INVOCATION, so we use
          // the original object.
          return wrap(func.apply(unwrap(this), args));
      };
  }
  function transformCachableValue(value) {
      if (typeof value === 'function')
          return wrapFunction(value);
      // This doesn't return, it just creates a 'done' promise for the transaction,
      // which is later returned for transaction.done (see idbObjectHandler).
      if (value instanceof IDBTransaction)
          cacheDonePromiseForTransaction(value);
      if (instanceOfAny(value, getIdbProxyableTypes()))
          return new Proxy(value, idbProxyTraps);
      // Return the same value back if we're not going to transform it.
      return value;
  }
  function wrap(value) {
      // We sometimes generate multiple promises from a single IDBRequest (eg when cursoring), because
      // IDB is weird and a single IDBRequest can yield many responses, so these can't be cached.
      if (value instanceof IDBRequest)
          return promisifyRequest(value);
      // If we've already transformed this value before, reuse the transformed value.
      // This is faster, but it also provides object equality.
      if (transformCache.has(value))
          return transformCache.get(value);
      const newValue = transformCachableValue(value);
      // Not all types are transformed.
      // These may be primitive types, so they can't be WeakMap keys.
      if (newValue !== value) {
          transformCache.set(value, newValue);
          reverseTransformCache.set(newValue, value);
      }
      return newValue;
  }
  const unwrap = (value) => reverseTransformCache.get(value);

  /**
   * Open a database.
   *
   * @param name Name of the database.
   * @param version Schema version.
   * @param callbacks Additional callbacks.
   */
  function openDB(name, version, { blocked, upgrade, blocking, terminated } = {}) {
      const request = indexedDB.open(name, version);
      const openPromise = wrap(request);
      if (upgrade) {
          request.addEventListener('upgradeneeded', (event) => {
              upgrade(wrap(request.result), event.oldVersion, event.newVersion, wrap(request.transaction), event);
          });
      }
      if (blocked) {
          request.addEventListener('blocked', (event) => blocked(
          // Casting due to https://github.com/microsoft/TypeScript-DOM-lib-generator/pull/1405
          event.oldVersion, event.newVersion, event));
      }
      openPromise
          .then((db) => {
          if (terminated)
              db.addEventListener('close', () => terminated());
          if (blocking) {
              db.addEventListener('versionchange', (event) => blocking(event.oldVersion, event.newVersion, event));
          }
      })
          .catch(() => { });
      return openPromise;
  }

  const readMethods = ['get', 'getKey', 'getAll', 'getAllKeys', 'count'];
  const writeMethods = ['put', 'add', 'delete', 'clear'];
  const cachedMethods = new Map();
  function getMethod(target, prop) {
      if (!(target instanceof IDBDatabase &&
          !(prop in target) &&
          typeof prop === 'string')) {
          return;
      }
      if (cachedMethods.get(prop))
          return cachedMethods.get(prop);
      const targetFuncName = prop.replace(/FromIndex$/, '');
      const useIndex = prop !== targetFuncName;
      const isWrite = writeMethods.includes(targetFuncName);
      if (
      // Bail if the target doesn't exist on the target. Eg, getAll isn't in Edge.
      !(targetFuncName in (useIndex ? IDBIndex : IDBObjectStore).prototype) ||
          !(isWrite || readMethods.includes(targetFuncName))) {
          return;
      }
      const method = async function (storeName, ...args) {
          // isWrite ? 'readwrite' : undefined gzipps better, but fails in Edge :(
          const tx = this.transaction(storeName, isWrite ? 'readwrite' : 'readonly');
          let target = tx.store;
          if (useIndex)
              target = target.index(args.shift());
          // Must reject if op rejects.
          // If it's a write operation, must reject if tx.done rejects.
          // Must reject with op rejection first.
          // Must resolve with op value.
          // Must handle both promises (no unhandled rejections)
          return (await Promise.all([
              target[targetFuncName](...args),
              isWrite && tx.done,
          ]))[0];
      };
      cachedMethods.set(prop, method);
      return method;
  }
  replaceTraps((oldTraps) => ({
      ...oldTraps,
      get: (target, prop, receiver) => getMethod(target, prop) || oldTraps.get(target, prop, receiver),
      has: (target, prop) => !!getMethod(target, prop) || oldTraps.has(target, prop),
  }));

  const advanceMethodProps = ['continue', 'continuePrimaryKey', 'advance'];
  const methodMap = {};
  const advanceResults = new WeakMap();
  const ittrProxiedCursorToOriginalProxy = new WeakMap();
  const cursorIteratorTraps = {
      get(target, prop) {
          if (!advanceMethodProps.includes(prop))
              return target[prop];
          let cachedFunc = methodMap[prop];
          if (!cachedFunc) {
              cachedFunc = methodMap[prop] = function (...args) {
                  advanceResults.set(this, ittrProxiedCursorToOriginalProxy.get(this)[prop](...args));
              };
          }
          return cachedFunc;
      },
  };
  async function* iterate(...args) {
      // tslint:disable-next-line:no-this-assignment
      let cursor = this;
      if (!(cursor instanceof IDBCursor)) {
          cursor = await cursor.openCursor(...args);
      }
      if (!cursor)
          return;
      cursor = cursor;
      const proxiedCursor = new Proxy(cursor, cursorIteratorTraps);
      ittrProxiedCursorToOriginalProxy.set(proxiedCursor, cursor);
      // Map this double-proxy back to the original, so other cursor methods work.
      reverseTransformCache.set(proxiedCursor, unwrap(cursor));
      while (cursor) {
          yield proxiedCursor;
          // If one of the advancing methods was not called, call continue().
          cursor = await (advanceResults.get(proxiedCursor) || cursor.continue());
          advanceResults.delete(proxiedCursor);
      }
  }
  function isIteratorProp(target, prop) {
      return ((prop === Symbol.asyncIterator &&
          instanceOfAny(target, [IDBIndex, IDBObjectStore, IDBCursor])) ||
          (prop === 'iterate' && instanceOfAny(target, [IDBIndex, IDBObjectStore])));
  }
  replaceTraps((oldTraps) => ({
      ...oldTraps,
      get(target, prop, receiver) {
          if (isIteratorProp(target, prop))
              return iterate;
          return oldTraps.get(target, prop, receiver);
      },
      has(target, prop) {
          return isIteratorProp(target, prop) || oldTraps.has(target, prop);
      },
  }));

  const DEFAULT_POLL_INTERVAL = 3e4;
  const MAX_MUTATION_ATTEMPTS = 3;
  const RETRY_BASE_DELAY = 1e3;
  const RETRY_MAX_DELAY = 6e4;
  class MutationPersistenceError extends Error {
    constructor(message, mutationIds, cause) {
      super(message);
      this.mutationIds = mutationIds;
      this.cause = cause;
      this.name = "MutationPersistenceError";
    }
  }
  class DataverseSyncDB {
    name;
    version;
    tables;
    MUTATION_QUEUE_NAME = "Mutations";
    ERRORED_MUTATIONS_NAME = "Errored Mutations";
    channel;
    closed = false;
    activeFetchControllers = /* @__PURE__ */ new Set();
    collectionCleanups = /* @__PURE__ */ new Set();
    channelMessageHandler;
    constructor(name, tables, version) {
      this.name = name;
      this.channel = new BroadcastChannel(name);
      this.version = version;
      this.tables = new Map(tables.map((v) => [v.entitySetName, v]));
      this.channelMessageHandler = (event) => {
        if (event.data?.type === "ABORT_ACTIVE_FETCHES") {
          this.abortActiveFetches();
        }
      };
      this.channel.addEventListener("message", this.channelMessageHandler);
    }
    sequence = 0;
    serializeMutation(mutation) {
      return {
        id: mutation.mutationId,
        type: mutation.type,
        value: mutation.modified,
        key: mutation.key,
        entitySetName: mutation.collection.id,
        timestamp: mutation.createdAt.valueOf(),
        sequence: this.sequence++,
        attempts: 0,
        ifMatch: getEtag(mutation.modified)
      };
    }
    db;
    async getDB() {
      if (!this.db) {
        const self = this;
        this.db = await openDB(this.name, this.version, {
          upgrade(database, oldVersion, _newVersion, transaction) {
            for (const storeName of Array.from(database.objectStoreNames)) {
              if (storeName !== self.MUTATION_QUEUE_NAME && storeName !== self.ERRORED_MUTATIONS_NAME) {
                database.deleteObjectStore(storeName);
              }
            }
            let store = database.objectStoreNames.contains(self.MUTATION_QUEUE_NAME) ? transaction.objectStore(self.MUTATION_QUEUE_NAME) : database.createObjectStore(self.MUTATION_QUEUE_NAME, { keyPath: "id" });
            if (!store.indexNames.contains("by_timestamp")) {
              store.createIndex("by_timestamp", ["timestamp", "sequence"]);
            }
            if (!database.objectStoreNames.contains(self.ERRORED_MUTATIONS_NAME)) {
              database.createObjectStore(self.ERRORED_MUTATIONS_NAME, { keyPath: "id" });
            }
            for (const table of self.tables.values()) {
              if (!database.objectStoreNames.contains(table.entitySetName)) {
                database.createObjectStore(table.entitySetName, { keyPath: table.primaryKey.key });
              }
            }
          }
        });
      }
      return this.db;
    }
    /**
     * Instantly aborts any in-flight remote server GET requests across all collections.
     */
    abortActiveFetches() {
      for (const controller of this.activeFetchControllers) {
        controller.abort("New mutation enqueued");
      }
      this.activeFetchControllers.clear();
    }
    close() {
      if (this.closed) return;
      this.closed = true;
      this.abortActiveFetches();
      for (const cleanup of [...this.collectionCleanups]) cleanup();
      this.collectionCleanups.clear();
      this.channel.removeEventListener("message", this.channelMessageHandler);
      this.channel.close();
      this.db?.close();
      this.db = void 0;
    }
    async flushQueue() {
      await navigator.locks.request(this.name, async () => {
        const db = await this.getDB();
        while (true) {
          const tx = db.transaction(this.MUTATION_QUEUE_NAME, "readonly");
          const index = tx.store.index("by_timestamp");
          const cursor = await index.openCursor(null, "next");
          if (!cursor) break;
          const mutation = cursor.value;
          if (mutation.nextAttemptAt && mutation.nextAttemptAt > Date.now()) {
            break;
          }
          const table = this.tables.get(mutation.entitySetName);
          if (!table) {
            console.error(`Table ${mutation.entitySetName} not registered in DB`);
            await db.delete(this.MUTATION_QUEUE_NAME, mutation.id);
            continue;
          }
          try {
            if (mutation.type === "insert") {
              await table.createRecord(mutation.value);
            } else if (mutation.type === "update") {
              await table.updateRecord(mutation.key, mutation.value, { ifMatch: mutation.ifMatch });
            } else if (mutation.type === "delete") {
              await table.deleteRecord(mutation.key, { ifMatch: mutation.ifMatch });
            }
            await db.delete(this.MUTATION_QUEUE_NAME, mutation.id);
          } catch (e) {
            if (!navigator.onLine) break;
            console.error(`[dataverse-offline] Failed to flush mutation ${mutation.id}:`, e);
            mutation.error = e;
            mutation.attempts++;
            mutation.lastAttemptAt = Date.now();
            if (mutation.attempts >= MAX_MUTATION_ATTEMPTS) {
              mutation.nextAttemptAt = void 0;
              await db.delete(this.MUTATION_QUEUE_NAME, mutation.id);
              await db.put(this.ERRORED_MUTATIONS_NAME, mutation);
            } else {
              const delay = Math.min(
                RETRY_MAX_DELAY,
                RETRY_BASE_DELAY * 2 ** (mutation.attempts - 1)
              );
              mutation.nextAttemptAt = mutation.lastAttemptAt + delay;
              await db.put(this.MUTATION_QUEUE_NAME, mutation);
              break;
            }
          }
        }
      });
    }
    async getQueueCount() {
      const db = await this.getDB();
      return db.count(this.MUTATION_QUEUE_NAME);
    }
    async getErroredMutations() {
      const db = await this.getDB();
      return db.getAll(this.ERRORED_MUTATIONS_NAME);
    }
    async retryErroredMutation(id) {
      const db = await this.getDB();
      const tx = db.transaction(
        [this.MUTATION_QUEUE_NAME, this.ERRORED_MUTATIONS_NAME],
        "readwrite"
      );
      const mutation = await tx.objectStore(this.ERRORED_MUTATIONS_NAME).get(id);
      if (mutation) {
        mutation.attempts = 0;
        mutation.error = void 0;
        mutation.lastAttemptAt = void 0;
        mutation.nextAttemptAt = void 0;
        await tx.objectStore(this.ERRORED_MUTATIONS_NAME).delete(id);
        await tx.objectStore(this.MUTATION_QUEUE_NAME).put(mutation);
      }
      await tx.done;
      if (mutation && navigator.onLine) await this.flushQueue();
    }
    async discardErroredMutation(id) {
      const db = await this.getDB();
      await db.delete(this.ERRORED_MUTATIONS_NAME, id);
    }
    async queueMutations(mutations) {
      if (mutations.length === 0) return;
      try {
        const db = await this.getDB();
        const storeNames = [
          this.MUTATION_QUEUE_NAME,
          ...new Set(mutations.map((mutation) => mutation.entitySetName))
        ];
        const tx = db.transaction(storeNames, "readwrite");
        for (const mutation of mutations) {
          if (mutation.type === "insert" || mutation.type === "update") {
            tx.objectStore(mutation.entitySetName).put(mutation.value);
          } else if (mutation.type === "delete") {
            tx.objectStore(mutation.entitySetName).delete(mutation.key);
          }
          tx.objectStore(this.MUTATION_QUEUE_NAME).put(mutation);
        }
        await tx.done;
      } catch (e) {
        console.error("[dataverse-offline] Error writing mutation to IDB:", e);
        throw new MutationPersistenceError(
          "Failed to persist offline mutations",
          mutations.map((mutation) => mutation.id),
          e
        );
      }
    }
    createCollectionOptions(config) {
      if (this.closed) throw new Error("DataverseSyncDB is closed");
      const {
        table,
        syncInterval = DEFAULT_POLL_INTERVAL,
        readOnlyWhenOffline = false,
        ...rest
      } = config;
      this.tables.set(table.entitySetName, table);
      const pk = table.primaryKey;
      const getKey = (item) => item[pk.key];
      const collectionId = table.entitySetName;
      let pollTimer;
      let syncFromDataverse;
      let syncController;
      let activeSync;
      let syncQueued = false;
      let disposed = false;
      const runSync = async () => {
        if (disposed) return;
        if (activeSync) {
          syncQueued = true;
          return activeSync;
        }
        syncController = new AbortController();
        this.activeFetchControllers.add(syncController);
        activeSync = syncFromDataverse(syncController.signal).finally(() => {
          this.activeFetchControllers.delete(syncController);
          syncController = void 0;
          activeSync = void 0;
        });
        await activeSync;
        if (syncQueued && !disposed) {
          syncQueued = false;
          await runSync();
        }
      };
      const scheduleNextSync = (time) => {
        return new Promise((resolve) => {
          if (pollTimer) clearTimeout(pollTimer);
          pollTimer = setTimeout(async () => {
            if (navigator.onLine && document.visibilityState === "visible") {
              await runSync();
              scheduleNextSync(syncInterval);
            }
            resolve();
          }, time);
        });
      };
      const flushAndSync = async () => {
        if (!disposed && document.visibilityState === "visible" && navigator.onLine) {
          await this.flushQueue();
          await scheduleNextSync(50);
        }
      };
      const syncConfig = {
        sync: ({ begin, write, commit, markReady, collection }) => {
          syncFromDataverse = async (signal) => {
            try {
              const records = await table.getRecords(void 0, { signal });
              if (signal.aborted) return;
              const keysToDelete = /* @__PURE__ */ new Set([
                ...collection.keys()
              ]);
              begin();
              for (const record of records) {
                const key = table.getPrimaryId(record);
                const existingRecord = collection.get(key);
                if (existingRecord) {
                  if (getEtag(record) !== getEtag(existingRecord)) {
                    write({ type: "update", value: record, metadata: { source: "dv" } });
                  }
                  keysToDelete.delete(key);
                } else {
                  write({ type: "insert", value: record, metadata: { source: "dv" } });
                }
              }
              for (const key of keysToDelete) {
                write({ type: "delete", value: collection.get(key), metadata: { source: "dv" } });
              }
              commit();
              const db = await this.getDB();
              const tx = db.transaction(table.entitySetName, "readwrite");
              await tx.store.clear();
              for (const record of records) {
                tx.store.put(record);
              }
              await tx.done;
            } catch (err) {
              if (err?.name !== "AbortError" && !signal.aborted) {
                console.warn(`[dataverse-offline] Remote sync failed for "${collectionId}":`, err);
              }
            } finally {
              markReady();
            }
          };
          const handleTabMessage = (event) => {
            if (event.data?.type === "MUTATIONS_ADDED") {
              begin();
              for (const mutation of event.data.mutations) {
                if (table.entitySetName === mutation.entitySetName) {
                  write({ type: mutation.type, value: mutation.value, metadata: { source: "tab" } });
                }
              }
              commit();
              scheduleNextSync(50);
            }
          };
          this.channel.addEventListener("message", handleTabMessage);
          const syncFromIDB = async () => {
            const db = await this.getDB();
            const cached = await db.getAll(table.entitySetName);
            if (!disposed && cached.length > 0) {
              begin();
              for (const item of cached) {
                write({ type: "insert", value: item, metadata: { source: "idb" } });
              }
              commit();
            }
          };
          syncFromIDB().then(flushAndSync).catch((err) => {
            if (!disposed) {
              console.warn(`[dataverse-offline] Cache sync failed for "${collectionId}":`, err);
            }
          });
          window.addEventListener("online", flushAndSync);
          document.addEventListener("visibilitychange", flushAndSync);
          const cleanup = () => {
            if (disposed) return;
            disposed = true;
            syncQueued = false;
            syncController?.abort("Collection disposed");
            this.channel.removeEventListener("message", handleTabMessage);
            if (pollTimer) clearTimeout(pollTimer);
            window.removeEventListener("online", flushAndSync);
            document.removeEventListener("visibilitychange", flushAndSync);
            this.collectionCleanups.delete(cleanup);
          };
          this.collectionCleanups.add(cleanup);
          return cleanup;
        },
        rowUpdateMode: "full"
      };
      const defaultMutation = async ({ transaction }) => {
        if (readOnlyWhenOffline && !navigator.onLine) {
          throw new Error("Collection is read-only while offline");
        }
        this.abortActiveFetches();
        this.channel.postMessage({ type: "ABORT_ACTIVE_FETCHES" });
        const serialized = transaction.mutations.map((v) => this.serializeMutation(v));
        await this.queueMutations(serialized);
        this.channel.postMessage({ type: "MUTATIONS_ADDED", mutations: serialized });
        if (navigator.onLine) {
          await this.flushQueue();
          await scheduleNextSync(100);
        }
      };
      return {
        ...rest,
        id: collectionId,
        getKey,
        sync: syncConfig,
        onInsert: defaultMutation,
        onUpdate: defaultMutation,
        onDelete: defaultMutation
      };
    }
  }

  async function seedRow(ctx, overrides = {}) {
    const id = await ctx.tables.TestTable.createRecord({
      name: ctx.fx.name("row"),
      ...overrides
    });
    return ctx.fx.track(id);
  }

  function makeSyncDB(tables, version = 1) {
    const name = `dvt-db-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    return new DataverseSyncDB(name, tables, version);
  }
  async function readQueue(db) {
    const idb = await db.getDB();
    return await idb.getAll(db.MUTATION_QUEUE_NAME);
  }
  async function readErrored(db) {
    const idb = await db.getDB();
    return await idb.getAll(db.ERRORED_MUTATIONS_NAME);
  }
  async function enqueueRaw(db, mutation) {
    await db.queueMutations([mutation]);
  }
  async function flush(db) {
    await db.flushQueue().catch(() => void 0);
  }
  function simulateOffline(offline) {
    const previous = navigator.onLine;
    Object.defineProperty(navigator, "onLine", {
      configurable: true,
      get: () => false
    });
    window.dispatchEvent(new Event("offline" ));
    return () => {
      Object.defineProperty(navigator, "onLine", {
        configurable: true,
        get: () => previous
      });
      window.dispatchEvent(new Event(previous ? "online" : "offline"));
    };
  }
  function forceVisible() {
    const previous = document.visibilityState;
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      get: () => "visible"
    });
    return () => {
      Object.defineProperty(document, "visibilityState", {
        configurable: true,
        get: () => previous
      });
    };
  }
  async function waitFor(predicate, timeoutMs = 5e3, intervalMs = 100) {
    const start = Date.now();
    while (!await predicate()) {
      if (Date.now() - start > timeoutMs) {
        throw new Error(`waitFor timed out after ${timeoutMs}ms`);
      }
      await new Promise((r) => setTimeout(r, intervalMs));
    }
  }

  const onlineCollectionSuite = {
    name: "online-collection",
    title: "Online @tanstack/db collection",
    async setup(ctx) {
      ctx.state.row = await seedRow(ctx, { int: 10, text: "online-coll", choice: "B" });
    },
    tests: (ctx) => [
      {
        name: "dataverseCollectionOptions builds a usable Collection",
        fn: async () => {
          const config = dataverseCollectionOptions({ table: ctx.tables.TestTable });
          const collection = createCollection(config);
          await waitFor(() => collection.size >= 1, 8e3);
          const found = collection.get(ctx.state.row);
          assert(found, "seeded row present in collection");
          assert(typeof found.int === "number", "row transformed (int is number)");
          assert(typeof found.name === "string", "row transformed (name is string)");
        }
      },
      {
        name: "insert through the collection persists to Dataverse",
        fn: async () => {
          const config = dataverseCollectionOptions({ table: ctx.tables.TestTable });
          const collection = createCollection(config);
          await waitFor(() => collection.size >= 1, 8e3);
          const name = ctx.fx.name("coll-insert");
          const id = crypto.randomUUID();
          collection.insert({ id, name, int: 77, text: "via-collection" });
          await waitFor(async () => {
            const rows2 = await ctx.tables.TestTable.getRecords({
              filter: `nnsyc200_name eq '${name}'`
            });
            return rows2.length === 1 && rows2[0].int === 77;
          }, 8e3);
          const rows = await ctx.tables.TestTable.getRecords({
            filter: `nnsyc200_name eq '${name}'`
          });
          ctx.fx.track(rows[0].id);
        }
      },
      {
        name: "update through the collection persists to Dataverse",
        fn: async () => {
          const config = dataverseCollectionOptions({ table: ctx.tables.TestTable });
          const collection = createCollection(config);
          await waitFor(() => collection.get(ctx.state.row) != null, 8e3);
          const entry = collection.get(ctx.state.row);
          assert(entry, "row in collection before update");
          collection.update(ctx.state.row, (d) => {
            d.int = 999;
          });
          await waitFor(async () => {
            const live = await getRecordSafe(ctx.tables.TestTable, ctx.state.row);
            return live?.int === 999;
          }, 8e3);
        }
      },
      {
        name: "delete through the collection removes from Dataverse",
        fn: async () => {
          const id = await seedRow(ctx, { int: 5, text: "coll-del" });
          const config = dataverseCollectionOptions({ table: ctx.tables.TestTable });
          const collection = createCollection(config);
          await waitFor(() => collection.get(id) != null, 8e3);
          collection.delete(id);
          await waitFor(async () => {
            return await getRecordSafe(ctx.tables.TestTable, id) == null;
          }, 8e3);
        }
      },
      {
        name: "forceSync pulls external changes into the collection",
        fn: async () => {
          const config = dataverseCollectionOptions({ table: ctx.tables.TestTable });
          const collection = createCollection(config);
          await waitFor(() => collection.get(ctx.state.row) != null, 8e3);
          await ctx.tables.TestTable.updateRecord(ctx.state.row, { int: 1234 });
          const utils = collection.utils;
          assert(typeof utils?.forceSync === "function", "forceSync util exposed");
          await utils.forceSync();
          await waitFor(() => collection.get(ctx.state.row)?.int === 1234, 8e3);
        }
      },
      {
        name: "utils.table references the configured table",
        fn: async () => {
          const config = dataverseCollectionOptions({ table: ctx.tables.TestTable });
          const collection = createCollection(config);
          await new Promise((r) => setTimeout(r, 300));
          const utils = collection.utils;
          assertInstanceOf(utils.table, ctx.tables.TestTable.constructor, "utils.table");
        }
      }
    ]
  };
  async function getRecordSafe(table, id) {
    try {
      return await table.getRecord(id);
    } catch {
      return null;
    }
  }

  const MAX_ATTEMPTS = 3;
  const offlineQueueSuite = {
    name: "offline-queue",
    title: "Offline mutation queue (DataverseSyncDB)",
    tests: (ctx) => [
      {
        name: "createCollectionOptions builds a collection backed by the sync DB",
        fn: async () => {
          const db = makeSyncDB([ctx.tables.TestTable, ctx.tables.TestTable0]);
          const restoreVis = forceVisible();
          try {
            const config = db.createCollectionOptions({ table: ctx.tables.TestTable });
            const collection = createCollection(config);
            await waitFor(() => collection.size >= 0, 3e3);
          } finally {
            restoreVis();
            db.close();
          }
        }
      },
      {
        name: "online insert is flushed and appears in Dataverse immediately",
        fn: async () => {
          const db = makeSyncDB([ctx.tables.TestTable, ctx.tables.TestTable0]);
          const restoreVis = forceVisible();
          try {
            const config = db.createCollectionOptions({ table: ctx.tables.TestTable });
            const collection = createCollection(config);
            await waitFor(() => collection.size >= 0, 3e3);
            const name = ctx.fx.name("offline-on");
            const id = crypto.randomUUID();
            collection.insert({ id, name, int: 11, text: "flush-me" });
            await waitFor(async () => {
              const queue = await readQueue(db);
              const rows2 = await ctx.tables.TestTable.getRecords({ filter: `nnsyc200_name eq '${name}'` });
              return queue.length === 0 && rows2.length === 1;
            }, 8e3);
            const rows = await ctx.tables.TestTable.getRecords({ filter: `nnsyc200_name eq '${name}'` });
            ctx.fx.track(rows[0].id);
          } finally {
            restoreVis();
            db.close();
          }
        }
      },
      {
        name: "offline insert is queued in IndexedDB and NOT sent to Dataverse",
        fn: async () => {
          const db = makeSyncDB([ctx.tables.TestTable, ctx.tables.TestTable0]);
          const restore = simulateOffline();
          const restoreVis = forceVisible();
          try {
            const config = db.createCollectionOptions({ table: ctx.tables.TestTable });
            const collection = createCollection(config);
            await waitFor(() => collection.size >= 0, 3e3);
            const name = ctx.fx.name("offline-q");
            const id = crypto.randomUUID();
            collection.insert({ id, name, int: 22, text: "queued" });
            await new Promise((r) => setTimeout(r, 500));
            const queue = await readQueue(db);
            assert(queue.length === 1, `expected 1 queued mutation, got ${queue.length}`);
            assertEquals(queue[0].type, "insert", "queued as insert");
            assertEquals(queue[0].entitySetName, ctx.tables.TestTable.entitySetName, "queue targets correct entity set");
            const rows = await ctx.tables.TestTable.getRecords({ filter: `nnsyc200_name eq '${name}'` });
            assertEquals(rows.length, 0, "offline insert must NOT reach Dataverse yet");
          } finally {
            restore();
            restoreVis();
            db.close();
          }
        }
      },
      {
        name: "coming back online flushes the queued mutation",
        fn: async () => {
          const db = makeSyncDB([ctx.tables.TestTable, ctx.tables.TestTable0]);
          const restore = simulateOffline();
          const restoreVis = forceVisible();
          let name = "";
          try {
            const config = db.createCollectionOptions({ table: ctx.tables.TestTable });
            const collection = createCollection(config);
            await waitFor(() => collection.size >= 0, 3e3);
            name = ctx.fx.name("offline-then-on");
            const id = crypto.randomUUID();
            collection.insert({ id, name, int: 33, text: "deferred" });
            await new Promise((r) => setTimeout(r, 400));
            restore();
            await waitFor(async () => {
              const queue = await readQueue(db);
              const rows2 = await ctx.tables.TestTable.getRecords({ filter: `nnsyc200_name eq '${name}'` });
              return queue.length === 0 && rows2.length === 1;
            }, 1e4);
            const rows = await ctx.tables.TestTable.getRecords({ filter: `nnsyc200_name eq '${name}'` });
            ctx.fx.track(rows[0].id);
          } finally {
            restore();
            restoreVis();
            db.close();
          }
        }
      },
      {
        name: "getQueueCount / getErroredMutations report DB state",
        fn: async () => {
          const db = makeSyncDB([ctx.tables.TestTable, ctx.tables.TestTable0]);
          const restore = simulateOffline();
          const restoreVis = forceVisible();
          try {
            const config = db.createCollectionOptions({ table: ctx.tables.TestTable });
            const collection = createCollection(config);
            await waitFor(() => collection.size >= 0, 3e3);
            const name = ctx.fx.name("qcount");
            const id = crypto.randomUUID();
            collection.insert({ id, name, int: 44, text: "x" });
            await new Promise((r) => setTimeout(r, 400));
            const count = await db.getQueueCount();
            assert(count >= 1, `getQueueCount should see the queued mutation (got ${count})`);
            const errored = await db.getErroredMutations();
            assertEquals(errored.length, 0, "no errored mutations yet");
          } finally {
            restore();
            restoreVis();
            db.close();
          }
        }
      },
      {
        name: "errored mutation can be retried and discarded",
        fn: async () => {
          const db = makeSyncDB([ctx.tables.TestTable, ctx.tables.TestTable0]);
          const restoreVis = forceVisible();
          const id = await seedRow(ctx, { int: 1, text: "will-fail" });
          const collection = createCollection(db.createCollectionOptions({ table: ctx.tables.TestTable }));
          try {
            await waitFor(() => collection.size >= 1, 8e3);
            const eid = `test-err-${Date.now()}`;
            await enqueueRaw(db, {
              id: eid,
              type: "update",
              key: id,
              value: { id, int: 2 },
              entitySetName: ctx.tables.TestTable.entitySetName,
              timestamp: Date.now(),
              sequence: 0,
              attempts: 0,
              ifMatch: 'W/"999999"'
            });
            for (let i = 0; i < MAX_ATTEMPTS + 2; i++) {
              await flush(db);
              await new Promise((r) => setTimeout(r, 80));
            }
            const errored = await readErrored(db);
            assert(errored.length >= 1, `expected the failing mutation in errored store (got ${errored.length})`);
            const found = errored.find((m) => m.id === eid);
            assert(found, "the injected mutation is in the errored store");
            await db.retryErroredMutation(eid);
            const afterRetry = await readErrored(db);
            assert(!afterRetry.some((m) => m.id === eid), "retry removed it from errored store");
            await db.discardErroredMutation(eid);
          } finally {
            await ctx.tables.TestTable.deleteRecord(id).catch(() => void 0);
            restoreVis();
            db.close();
          }
        }
      }
    ]
  };

  const crossTabSuite = {
    name: "cross-tab",
    title: "Cross-tab BroadcastChannel propagation",
    async setup(ctx) {
      ctx.state.row = await seedRow(ctx, { int: 5, text: "x-tab", choice: "B" });
    },
    tests: (ctx) => [
      {
        name: "a mutation on one collection is reflected in a sibling collection",
        fn: async () => {
          const dbName = `dvt-xtab-${Date.now().toString(36)}`;
          const tables = [ctx.tables.TestTable, ctx.tables.TestTable0];
          const dbA = new DataverseSyncDB(dbName, tables, 1);
          const dbB = new DataverseSyncDB(dbName, tables, 1);
          const restoreVis = forceVisible();
          let a, b;
          try {
            a = createCollection(dbA.createCollectionOptions({ table: ctx.tables.TestTable }));
            b = createCollection(dbB.createCollectionOptions({ table: ctx.tables.TestTable }));
            await waitFor(() => a.size >= 1 && b.size >= 1, 8e3);
            const name = ctx.fx.name("xtab");
            const id = crypto.randomUUID();
            a.insert({ id, name, int: 8, text: "from-a" });
            await waitFor(() => [...b.values()].some((v) => v.name === name), 8e3);
            const inB = [...b.values()].find((v) => v.name === name);
            assert(inB, "sibling collection received the mutation via BroadcastChannel");
            assertEquals(inB.int, 8, "propagated row keeps its values");
          } finally {
            restoreVis();
            dbA.close();
            dbB.close();
          }
        }
      },
      {
        name: "ABORT_ACTIVE_FETCHES signal is broadcast between collections",
        fn: async () => {
          const dbName = `dvt-xtab-${Date.now().toString(36)}`;
          const tables = [ctx.tables.TestTable, ctx.tables.TestTable0];
          const dbA = new DataverseSyncDB(dbName, tables, 1);
          const dbB = new DataverseSyncDB(dbName, tables, 1);
          const restoreVis = forceVisible();
          let a, b;
          try {
            a = createCollection(dbA.createCollectionOptions({ table: ctx.tables.TestTable }));
            b = createCollection(dbB.createCollectionOptions({ table: ctx.tables.TestTable }));
            await waitFor(() => a.size >= 1 && b.size >= 1, 8e3);
            const name = ctx.fx.name("xtab-abort");
            const id = crypto.randomUUID();
            a.insert({ id, name, int: 9, text: "z" });
            await waitFor(() => [...b.values()].some((v) => v.name === name), 8e3);
            assert([...b.values()].some((v) => v.name === name), "b saw the row (abort broadcast path exercised)");
          } finally {
            restoreVis();
            dbA.close();
            dbB.close();
          }
        }
      }
    ]
  };

  const durabilitySuite = {
    name: "durability",
    title: "IndexedDB durability across reload",
    tests: (ctx) => [
      {
        name: "offline mutation persists across a fresh DB instance and flushes on reconnect",
        fn: async () => {
          const name = ctx.fx.name("durable");
          const dbName = `dvt-dur-${Date.now().toString(36)}`;
          const tables = [ctx.tables.TestTable, ctx.tables.TestTable0];
          const db1 = new DataverseSyncDB(dbName, tables, 1);
          const restore1 = simulateOffline();
          const restoreVis1 = forceVisible();
          let collection1;
          try {
            collection1 = createCollection(db1.createCollectionOptions({ table: ctx.tables.TestTable }));
            await waitFor(() => collection1.size >= 0, 3e3);
            const id = crypto.randomUUID();
            collection1.insert({ id, name, int: 55, text: "durable" });
            await new Promise((r) => setTimeout(r, 400));
            const q1 = await readQueue(db1);
            assert(q1.length === 1, `mutation queued in session 1 (got ${q1.length})`);
          } finally {
            restore1();
            restoreVis1();
            db1.close();
          }
          const db2 = new DataverseSyncDB(dbName, tables, 1);
          const restoreVis2 = forceVisible();
          try {
            const q2 = await readQueue(db2);
            assert(q2.length === 1, `mutation survived reload in IndexedDB (got ${q2.length})`);
            assertEquals(q2[0].entitySetName, ctx.tables.TestTable.entitySetName, "survived mutation targets right entity");
            const collection2 = createCollection(db2.createCollectionOptions({ table: ctx.tables.TestTable }));
            await waitFor(async () => {
              const queue = await readQueue(db2);
              const rows2 = await ctx.tables.TestTable.getRecords({ filter: `nnsyc200_name eq '${name}'` });
              return queue.length === 0 && rows2.length === 1;
            }, 1e4);
            const rows = await ctx.tables.TestTable.getRecords({ filter: `nnsyc200_name eq '${name}'` });
            ctx.fx.track(rows[0].id);
          } finally {
            restoreVis2();
            db2.close();
          }
        }
      },
      {
        name: "cache store is rebuilt from a fresh sync after clear",
        fn: async () => {
          const db = makeSyncDB([ctx.tables.TestTable, ctx.tables.TestTable0]);
          const restoreVis = forceVisible();
          const id = await seedRow(ctx, { int: 7, text: "cache-me" });
          createCollection(db.createCollectionOptions({ table: ctx.tables.TestTable }));
          try {
            await waitFor(async () => {
              const idb = await db.getDB();
              const cached = await idb.getAll(ctx.tables.TestTable.entitySetName);
              return cached.some((r) => r.id === id);
            }, 8e3);
          } finally {
            restoreVis();
            db.close();
          }
        }
      }
    ]
  };

  const suites = [
    onlineCollectionSuite,
    offlineQueueSuite,
    crossTabSuite,
    durabilitySuite
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
    window.addEventListener("unload", () => {
      void sweepOrphans(tables.TestTable);
    });
  }
  if (document.body) {
    void boot();
  } else {
    window.addEventListener("DOMContentLoaded", () => void boot(), { once: true });
  }

})();
