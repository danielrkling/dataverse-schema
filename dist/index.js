import * as v from "valibot";

//#region src/util.ts
const ETAG = "$etag";
const rxGUID = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/i;
const rxDateOnly = /^\d{4}-\d{2}-\d{2}$/;
function isNonEmptyString(value) {
	return typeof value === "string" && value.length > 0;
}
function wrapString(value) {
	if (value === null) return "null";
	if (typeof value === "string") {
		if (rxGUID.test(value) || rxDateOnly.test(value)) return value;
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
var OrderSpec = class {
	fields;
	direction;
	constructor(fields, direction) {
		this.fields = fields;
		this.direction = direction;
	}
	toString() {
		return this.fields.map((f) => `${f} ${this.direction}`).join(",");
	}
};
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
		if (v.select) expandParts.push(`$select=${select(...Array.isArray(v.select) ? v.select : [v.select])}`);
		if (v.filter) expandParts.push(`$filter=${v.filter}`);
		if (v.orderby) expandParts.push(`$orderby=${orderby(v.orderby)}`);
		if (v.expand) expandParts.push(`$expand=${expand(v.expand)}`);
		return `${name}(${expandParts.join(";")})`;
	}).join(",");
}
function attachETag(v) {
	if (v && typeof v === "object") v[ETAG] = v["@odata.etag"];
	return v;
}
function getEtag(v) {
	return v?.[ETAG];
}
/**
* Retains references to previous recrods if ETag value is unchanged
*
* @param prevRecords
* @param newRecords
* @returns
*/
function mergeRecords(prevRecords, newRecords) {
	const prevMap = new Map(prevRecords.map((v) => [v[ETAG], v]));
	return newRecords.map((v) => prevMap.get(v["$etag"]) ?? v);
}
/**
* Creates an XML string from a template string array, removing unnecessary whitespace.
*
* @param raw The template string array.
* @param values The values to interpolate into the template string.
* @returns A compact XML string.
*
* @example
* // Create a simple XML string:
* const myXml = xml`
* <root>
* <element>Hello</element>
* </root>
* `;
* // returns "<root><element>Hello</element></root>"
*/
function xml(raw, ...values) {
	return String.raw(raw, values).trim().replace(/>\s+</g, "><");
}
/**
* Converts a File object to a base64 encoded string.
*
* @param file The File object to convert.
* @returns A promise that resolves to the base64 encoded string, or rejects with an error.
*
* @example
* // Convert a file to base64:
* const myFile = document.getElementById('myFile').files[0];
* toBase64(myFile)
* .then(base64String => console.log(base64String))
* .catch(error => console.error(error));
*/
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
/**
* Creates a data URL from a base64 encoded image string.
*
* @param base64 The base64 encoded image string.
* @returns A data URL representing the image.
*
* @example
* // Create a data URL from a base64 string:
* const base64String = "iVBORw0KGgoAAAANSUhEUg..."; // A long base64 string
* const imageUrl = base64ImageToURL(base64String);
* // returns "data:image/png;base64,iVBORw0KGgoAAAANSUhEUg..."
*/
function base64ImageToURL(base64) {
	return `data:${detectImageType(base64)};base64,${base64}`;
}
/**
* Detects the image type from a base64 encoded string.
*
* @param base64 The base64 encoded image string.
* @returns The image type (e.g., "image/png", "image/jpeg", "image/gif").  Defaults to "image/png" if type is unknown.
*
* @example
* const pngBase64 = "iVBORw0KGgoAAAANSUhEUgAA...";
* detectImageType(pngBase64); // returns "image/png"
*
* const jpgBase64 = "/9j/4AAQSkZJRgABAQEAYABgAAD/";
* detectImageType(jpgBase64); // returns "image/jpeg"
*/
function detectImageType(base64) {
	if (base64.startsWith("iVBORw0KGgoAAAANSUhEUgAA")) return "image/png";
	else if (base64.startsWith("/9j/4AAQSkZJRgABAQEAYABgAAD/")) return "image/jpeg";
	else if (base64.startsWith("R0lGODlh")) return "image/gif";
	else return "image/png";
}
/**
* Constructs a URL to retrieve an image from Dataverse.
*
* @param entity The logical name of the entity the image belongs to.
* @param name The name of the image attribute.
* @param id The ID of the entity record.
* @returns A URL string to download the image.
*
* @example
* // Get the URL for a contact's profile image:
* const imageUrl = getImageUrl("contact", "entityimage", "12345");
* // returns "/Image/download.aspx?Entity=contact&Attribute=entityimage&Id=12345&Full=true"
*/
function getImageUrl(entity, name, id) {
	return `${location.origin}/Image/download.aspx?Entity=${entity}&Attribute=${name}&Id=${id}&Full=true`;
}
function parseDateOnly(dateString) {
	const [year, month, day] = dateString.slice(0, 10).split("-").map(Number);
	return new Date(year ?? 0, (month ?? 0) - 1, day);
}
function toDateOnly(date) {
	try {
		return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
	} catch (e) {
		return null;
	}
}
/** Extracts the string name from a FieldName type. */
function getName(name) {
	if (typeof name === "string") return name;
	if ("name" in name) return name.name;
	if (typeof name.toString === "function") return name.toString();
	return String(name);
}

//#endregion
//#region src/client.ts
const parenthesesRegEx = /\(([^)]+)\)/;
var DataverseHttpError = class extends Error {
	status;
	statusText;
	body;
	response;
	constructor(message, status, statusText, body, response) {
		super(message);
		this.status = status;
		this.statusText = statusText;
		this.body = body;
		this.response = response;
		this.name = "DataverseHttpError";
	}
};
/**
* Low-level HTTP client for the Dataverse Web API (v9.2).
* Provides CRUD, batch, action, function, and bulk operation methods.
*
* @example
* const client = new DataverseClient({
*   url: "https://org.crm.dynamics.com",
*   token: "eyJ...",
* });
*
* @example
* // With impersonation
* const client = new DataverseClient({
*   url: "https://org.crm.dynamics.com",
*   impersonateByUserId: "00000000-0000-0000-0000-000000000001",
* });
*/
var DataverseClient = class {
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
		const { headers, impersonateByAAId, impersonateByUserId, token, prefer, consistency, solutionUniqueName, suppressDuplicateDetection, bypassCustomPluginExecution } = this.options;
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
		if (response.status === 304) return null;
		if (response.headers.get("Content-Type")?.includes("application/json")) {
			const data = await response.json();
			if (data.error) throw new DataverseHttpError(`${response.status} ${data.error.message ?? response.statusText}`, response.status, response.statusText, data.error, response);
			if (!response.ok) throw new DataverseHttpError(`${response.status} ${response.statusText}`, response.status, response.statusText, data, response);
			return data;
		}
		if (!response.ok) {
			const body = await response.text();
			throw new DataverseHttpError(`${response.status} ${response.statusText}`, response.status, response.statusText, body, response);
		}
		return await response.text();
	}
	_resolvePrefer(prefer) {
		return prefer.map((p) => {
			if (typeof p === "string") return p;
			if ("annotations" in p) return `odata.include-annotations="${Array.isArray(p.annotations) ? p.annotations.join(",") : p.annotations}"`;
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
		for await (const page of this.iteratePages(entitySetName, options)) results.push(...page);
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
		for await (const page of this.iteratePages(entitySetName, options)) yield* page;
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
		yield* this._iteratePages(this._resource(getName(entitySetName), options.query), options.pageSize, options.signal);
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
		if (typeof result !== "string" || !result) throw new Error("Dataverse did not return a record ID");
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
		const request = {
			method: "DELETE",
			signal: options.signal
		};
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
		return this.fetch(`${getName(entitySetName)}(${id})/${getName(propertyName)}/$value`, {
			raw: true,
			...options
		});
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
			body: JSON.stringify({ "@odata.id": `${this.options.url}/api/data/v9.2/${getName(childEntitySetName)}(${childId})` }),
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
		await this.fetch(resource, {
			method: "DELETE",
			...options
		});
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
		for await (const page of this._iteratePages(this._resource(`${getName(entitySetName)}(${id})/${getName(navigationPropertyName)}`, options.query), options?.pageSize, options?.signal)) records.push(...page);
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
		const currentIds = (await this.getAssociatedRecords(entitySetName, parentId, propertyName, { query: `$select=${getName(childPrimaryKeyName)}` })).map((r) => r[getName(childPrimaryKeyName)]);
		const promises = [];
		for (const id of childIds) if (!currentIds.includes(id)) promises.push(this.associateRecord(entitySetName, parentId, propertyName, childEntitySetName, id));
		for (const id of currentIds) if (!childIds.includes(id)) promises.push(this.dissociateRecord(entitySetName, parentId, propertyName, id));
		await Promise.all(promises);
		return childIds;
	}
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
		return this.fetch(`${getName(entitySetName)}(${id})/Microsoft.Dynamics.CRM.${functionName}${paramString}`);
	}
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
		return this.fetch(`${getName(entitySetName)}/Microsoft.Dynamics.CRM.CreateMultiple`, {
			method: "POST",
			body: JSON.stringify({ Targets: records })
		});
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
		return this.fetch(`${getName(entitySetName)}/Microsoft.Dynamics.CRM.UpdateMultiple`, {
			method: "POST",
			body: JSON.stringify({ Targets: records })
		});
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
		const targets = ids.map((id) => ({ "@odata.id": `${this.options.url}/api/data/v9.2/${getName(entitySetName)}(${id})` }));
		return this.fetch(`${getName(entitySetName)}/Microsoft.Dynamics.CRM.DeleteMultiple`, {
			method: "POST",
			body: JSON.stringify({ Targets: targets })
		});
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
		return await this.fetch("$batch", {
			method: "POST",
			headers: { "Content-Type": `multipart/mixed; boundary="batch_${batchId}"` },
			body
		});
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
};

//#endregion
//#region src/functions.ts
/**
* Retrieves the roles assigned to a user in Azure Active Directory (AAD).
*
* @param aadId - The AAD Directory Object ID of the user whose roles need to be fetched.
* @returns  A promise that resolves to a Set of role names associated with the user.
*/
async function RetrieveAadUserRoles(client, aadId) {
	return client.fetch(`RetrieveAadUserRoles(DirectoryObjectId=${aadId})?$select=name`).then((d) => new Set(d.value.map((r) => r.name)));
}
/**
* Retrieves the total record count for a specific entity in the system.
*
* @param  logicalName - The logical name of the entity whose total record count is to be fetched.
* @returns  A promise that resolves to the total record count for the specified entity.
*/
async function RetrieveTotalRecordCount(client, logicalName) {
	return client.fetch(`RetrieveTotalRecordCount(EntityNames=['${logicalName}'])`).then((d) => {
		const entry = (d?.Values ?? d?.EntityNameCountCollection ?? [])[0];
		if (entry == null) return 0;
		if (typeof entry === "number") return entry;
		return Number(entry.Count ?? entry.count ?? entry.Value ?? 0);
	});
}
/**
* Retrieves the identity information of the currently authenticated user.
*
* @returns A promise that resolves to an object containing the BusinessUnitId, UserId, and OrganizationId
* of the currently authenticated user.
*/
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

//#endregion
//#region src/query/shared/field-ref.ts
var FieldRef = class FieldRef {
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
};

//#endregion
//#region src/query/path.ts
function propertyName(property) {
	return property.fromDataverseName ?? property.logicalName;
}
function fieldPathName(path) {
	return path.map(propertyName).join("/");
}

//#endregion
//#region src/query/filter/render-odata.ts
function renderFilterOdata(node, scope) {
	const fieldName = (path) => `${scope ? `${scope}/` : ""}${fieldPathName(path)}`;
	switch (node.type) {
		case "comparison": return `(${fieldName(node.field)} ${node.operator} ${wrapString(node.value)})`;
		case "null": return `${fieldName(node.field)} ${node.positive ? "eq" : "ne"} null`;
		case "contains": return `contains(${fieldName(node.field)},${wrapString(node.value)})`;
		case "startsWith": return `startswith(${fieldName(node.field)},${wrapString(node.value)})`;
		case "endsWith": return `endswith(${fieldName(node.field)},${wrapString(node.value)})`;
		case "compare": return `(${fieldName(node.field)} ${node.operator} ${fieldName(node.otherField)})`;
		case "lambda": return `${fieldPathName(node.field)}/${node.operator}(${node.alias}: ${renderFilterOdata(node.condition, node.alias)})`;
		case "fn": {
			const field = wrapString(fieldName(node.field));
			const vals = node.values.map(wrapString);
			if (vals.length === 0) return `Microsoft.Dynamics.CRM.${node.fnName}(PropertyName=${field})`;
			if (vals.length === 1) return `Microsoft.Dynamics.CRM.${node.fnName}(PropertyName=${field},PropertyValue=${vals[0]})`;
			if (node.fnName === "Between" || node.fnName === "NotBetween") return `Microsoft.Dynamics.CRM.${node.fnName}(PropertyName=${field},PropertyValues=[${vals.join(",")}])`;
			if (node.fnName === "InFiscalPeriodAndYear" || node.fnName === "InOrAfterFiscalPeriodAndYear" || node.fnName === "InOrBeforeFiscalPeriodAndYear") return `Microsoft.Dynamics.CRM.${node.fnName}(PropertyName=${field},PropertyValue1=${vals[0]},PropertyValue2=${vals[1]})`;
			return `Microsoft.Dynamics.CRM.${node.fnName}(PropertyName=${field},PropertyValues=[${vals.join(",")}])`;
		}
		case "raw": return node.value;
		case "and": return node.conditions.length === 0 ? "" : `(${node.conditions.map((child) => renderFilterOdata(child, scope)).join(" and ")})`;
		case "or": return node.conditions.length === 0 ? "" : `(${node.conditions.map((child) => renderFilterOdata(child, scope)).join(" or ")})`;
		case "not": return `not(${renderFilterOdata(node.condition, scope)})`;
	}
}

//#endregion
//#region src/query/filter/render-fetchxml.ts
function escapeXml$1(value) {
	return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}
function renderFilterFetchXml(node) {
	const fieldName = (path) => fieldPathName(path);
	switch (node.type) {
		case "comparison": return `<condition attribute="${escapeXml$1(fieldName(node.field))}" operator="${escapeXml$1(node.operator)}" value="${node.value === null ? "" : escapeXml$1(String(node.value))}" />`;
		case "null": return `<condition attribute="${escapeXml$1(fieldName(node.field))}" operator="${node.positive ? "null" : "not-null"}" />`;
		case "contains": return `<condition attribute="${escapeXml$1(fieldName(node.field))}" operator="like" value="%${escapeXml$1(node.value)}%" />`;
		case "startsWith": return `<condition attribute="${escapeXml$1(fieldName(node.field))}" operator="begins-with" value="${escapeXml$1(node.value)}" />`;
		case "endsWith": return `<condition attribute="${escapeXml$1(fieldName(node.field))}" operator="ends-with" value="${escapeXml$1(node.value)}" />`;
		case "compare": return `<condition attribute="${escapeXml$1(fieldName(node.field))}" operator="${escapeXml$1(node.operator)}" valueof="${escapeXml$1(fieldName(node.otherField))}" />`;
		case "lambda": return `<condition entityname="${escapeXml$1(fieldName(node.field))}" operator="${escapeXml$1(node.operator)}" value="${escapeXml$1(`${node.alias}: ${renderFilterFetchXml(node.condition)}`)}" />`;
		case "fn": {
			const attr = escapeXml$1(fieldName(node.field));
			const op = escapeXml$1(node.operator);
			if (node.values.length === 0) return `<condition attribute="${attr}" operator="${op}" />`;
			if (node.values.length === 1) return `<condition attribute="${attr}" operator="${op}" value="${escapeXml$1(String(node.values[0]))}" />`;
			return `<condition attribute="${attr}" operator="${op}">${node.values.map((value) => `<value>${escapeXml$1(String(value))}</value>`).join("")}</condition>`;
		}
		case "raw": return node.value;
		case "and": return node.conditions.length === 0 ? "" : `<filter type="and">${node.conditions.map(renderFilterFetchXml).join("")}</filter>`;
		case "or": return node.conditions.length === 0 ? "" : `<filter type="or">${node.conditions.map(renderFilterFetchXml).join("")}</filter>`;
		case "not": return `<filter type="and"><filter type="or">${renderFilterFetchXml(node.condition)}</filter></filter>`;
	}
}

//#endregion
//#region src/query/filter/expr.ts
function toRef(field) {
	if (field instanceof FieldRef) return field;
	const f = field;
	return new FieldRef(f, f.fromDataverseName ?? f.logicalName);
}
/** Returns a ref if the value is a field reference or raw property instance, otherwise null. */
function asRef(value) {
	if (value instanceof FieldRef) return value;
	if (value && typeof value === "object") {
		const v = value;
		if (typeof (v.fromDataverseName ?? v.logicalName) === "string") return toRef(value);
	}
	return null;
}
function pathOf(field) {
	return toRef(field).path;
}
/** Converts typed field values (e.g. choice labels) into their Dataverse representation before rendering. */
function toFilterValue(field, value) {
	const f = toRef(field).field;
	if (value == null || typeof value !== "string") return value;
	if (f?.type !== "choice") return value;
	return f.transformValueToDataverse(value);
}
var FilterExpr = class {
	node;
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
};
function fn(field, fnName, operator, values) {
	return new FilterExpr({
		type: "fn",
		field: pathOf(field),
		fnName,
		operator,
		values: values.map((v) => toFilterValue(field, v))
	});
}
function compare(field, operator, value) {
	const other = asRef(value);
	if (other) return new FilterExpr({
		type: "compare",
		field: pathOf(field),
		operator,
		otherField: other.path
	});
	const ref = toRef(field);
	return new FilterExpr({
		type: "comparison",
		field: ref.path,
		operator,
		value: toFilterValue(ref, value)
	});
}
function eq(field, value) {
	return compare(field, "eq", value);
}
function ne(field, value) {
	return compare(field, "ne", value);
}
function gt(field, value) {
	return compare(field, "gt", value);
}
function ge(field, value) {
	return compare(field, "ge", value);
}
function lt(field, value) {
	return compare(field, "lt", value);
}
function le(field, value) {
	return compare(field, "le", value);
}
function isNull(field) {
	return new FilterExpr({
		type: "null",
		field: pathOf(field),
		positive: true
	});
}
function isNotNull(field) {
	return new FilterExpr({
		type: "null",
		field: pathOf(field),
		positive: false
	});
}
function contains(field, value) {
	return new FilterExpr({
		type: "contains",
		field: pathOf(field),
		value
	});
}
function startsWith(field, value) {
	return new FilterExpr({
		type: "startsWith",
		field: pathOf(field),
		value
	});
}
function endsWith(field, value) {
	return new FilterExpr({
		type: "endsWith",
		field: pathOf(field),
		value
	});
}
function and(...conditions) {
	const exprs = conditions.filter((c) => c != null && c !== "").map((c) => typeof c === "string" ? new FilterExpr({
		type: "raw",
		value: c
	}) : c);
	return new FilterExpr({
		type: "and",
		conditions: exprs.map((expr) => expr.getNode())
	});
}
function or(...conditions) {
	const exprs = conditions.filter((c) => c != null && c !== "").map((c) => typeof c === "string" ? new FilterExpr({
		type: "raw",
		value: c
	}) : c);
	return new FilterExpr({
		type: "or",
		conditions: exprs.map((expr) => expr.getNode())
	});
}
function not(condition) {
	const c = typeof condition === "string" ? new FilterExpr({
		type: "raw",
		value: condition
	}) : condition;
	return new FilterExpr({
		type: "not",
		condition: c.getNode()
	});
}
function isActive() {
	return eq(FieldRef.fromPath(new NumberField("statecode"), "statecode"), 0);
}
function isInactive() {
	return eq(FieldRef.fromPath(new NumberField("statecode"), "statecode"), 1);
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

//#endregion
//#region src/query/shared/aggregation.ts
function fieldName(field) {
	return typeof field === "string" ? field : field.toString();
}
var GroupByExpr = class {
	field;
	fieldRef;
	path;
	constructor(field, fieldRef) {
		this.field = field;
		this.fieldRef = fieldRef;
		this.path = fieldRef?.path;
	}
};
var Aggregation = class {
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
};
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

//#endregion
//#region src/query/filter/input.ts
function filterInputNode(filter, proxy) {
	const value = typeof filter === "function" ? filter(proxy) : filter;
	return typeof value === "string" ? {
		type: "raw",
		value
	} : value.getNode();
}
function renderFilterInput(filter, proxy, dialect) {
	const value = typeof filter === "function" ? filter(proxy) : filter;
	if (typeof value === "string") return value;
	return dialect === "odata" ? value.toOdata() : value.toFetchXml();
}

//#endregion
//#region src/query/odata/ast.ts
function toODataPath(path) {
	return fieldPathName(path);
}
function toODataFilterNode(node) {
	switch (node.type) {
		case "comparison": return {
			...node,
			field: toODataPath(node.field)
		};
		case "null": return {
			...node,
			field: toODataPath(node.field)
		};
		case "contains":
		case "startsWith":
		case "endsWith": return {
			...node,
			field: toODataPath(node.field)
		};
		case "compare": return {
			...node,
			field: toODataPath(node.field),
			otherField: toODataPath(node.otherField)
		};
		case "lambda": return {
			...node,
			field: toODataPath(node.field),
			condition: toODataFilterNode(node.condition)
		};
		case "fn": return {
			...node,
			field: toODataPath(node.field)
		};
		case "raw": return node;
		case "and":
		case "or": return {
			...node,
			conditions: node.conditions.map(toODataFilterNode)
		};
		case "not": return {
			...node,
			condition: toODataFilterNode(node.condition)
		};
	}
}
function renderFilter(node, scope) {
	const field = (path) => `${scope ? `${scope}/` : ""}${path}`;
	switch (node.type) {
		case "comparison": return `(${field(node.field)} ${node.operator} ${wrapString(node.value)})`;
		case "null": return `${field(node.field)} ${node.positive ? "eq" : "ne"} null`;
		case "contains": return `contains(${field(node.field)},${wrapString(node.value)})`;
		case "startsWith": return `startswith(${field(node.field)},${wrapString(node.value)})`;
		case "endsWith": return `endswith(${field(node.field)},${wrapString(node.value)})`;
		case "compare": return `(${field(node.field)} ${node.operator} ${field(node.otherField)})`;
		case "lambda": return `${node.field}/${node.operator}(${node.alias}: ${renderFilter(node.condition, node.alias)})`;
		case "fn": {
			const propertyName = wrapString(field(node.field));
			const values = node.values.map(wrapString);
			if (values.length === 0) return `Microsoft.Dynamics.CRM.${node.fnName}(PropertyName=${propertyName})`;
			if (values.length === 1) return `Microsoft.Dynamics.CRM.${node.fnName}(PropertyName=${propertyName},PropertyValue=${values[0]})`;
			if (node.fnName === "Between" || node.fnName === "NotBetween") return `Microsoft.Dynamics.CRM.${node.fnName}(PropertyName=${propertyName},PropertyValues=[${values.join(",")}])`;
			if ([
				"InFiscalPeriodAndYear",
				"InOrAfterFiscalPeriodAndYear",
				"InOrBeforeFiscalPeriodAndYear"
			].includes(node.fnName)) return `Microsoft.Dynamics.CRM.${node.fnName}(PropertyName=${propertyName},PropertyValue1=${values[0]},PropertyValue2=${values[1]})`;
			return `Microsoft.Dynamics.CRM.${node.fnName}(PropertyName=${propertyName},PropertyValues=[${values.join(",")}])`;
		}
		case "raw": return node.value;
		case "and": return node.conditions.length === 0 ? "" : `(${node.conditions.map((child) => renderFilter(child, scope)).join(" and ")})`;
		case "or": return node.conditions.length === 0 ? "" : `(${node.conditions.map((child) => renderFilter(child, scope)).join(" or ")})`;
		case "not": return `not(${renderFilter(node.condition, scope)})`;
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
	if (ast.kind === "aggregate") return `aggregate(${ast.expressions.map((expression) => expression.field ? `${expression.field} with ${expression.operation} as ${expression.alias}` : `$count as ${expression.alias}`).join(",")})`;
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

//#endregion
//#region src/query/odata/builder.ts
const proxyTableMap = /* @__PURE__ */ new WeakMap();
const proxyPathMap = /* @__PURE__ */ new WeakMap();
var ODataApplyQuery = class {
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
			this._orderby.push({
				name: typeof result === "string" ? result : result.toString(),
				dir: direction
			});
		} else this._orderby.push({
			name: nameOrSelector,
			dir: direction
		});
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
			orderby: this._orderby.map((order) => ({
				field: order.name,
				direction: order.dir
			})),
			top: this._top
		};
	}
	toString() {
		return this._build();
	}
	_transformRow(v) {
		const r = { ...v };
		for (const [alias, field] of Object.entries(this._aliasFields)) if (field && alias in r) r[alias] = field.transformFromDataverse(r[alias]);
		r[ETAG] = v["@odata.etag"];
		delete r["@odata.etag"];
		return r;
	}
	async execute() {
		const results = [];
		for await (const page of this.iteratePages()) results.push(...page);
		return results;
	}
	async *iterate(options) {
		for await (const page of this.iteratePages(options)) yield* page;
	}
	async *iteratePages(options) {
		const qs = this.toString();
		const raw = this._table.client.iteratePages(this._table.entitySetName, {
			...options,
			query: qs
		});
		for await (const page of raw) yield page.map((v) => this._transformRow(v));
	}
};
var ODataQuery = class ODataQuery {
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
			for (const [key, prop] of Object.entries(this.#table.fields)) if (prop.kind === "value" || prop.type === "lookupId") {
				this.#fields.push([prop]);
				this.#selectedKeys.push(key);
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
		if (this.#subQueryMode === "collection" && isCollection) throw new Error("expand() within a collection expand only supports lookup navigation properties");
		const child = new ODataQuery(prop.table, isCollection ? "collection" : "lookup");
		const q = sub?.(child) ?? child;
		this.#expands.push({
			navigation: prop,
			key,
			query: q.toAst()
		});
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
		} else this.#orderby.push({
			field: pathForName(this.#table, nameOrSelector),
			direction
		});
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
				aggregateExpressions.push({
					field: value.path ? toODataPath(value.path) : void 0,
					operation: value.operation,
					alias
				});
				aliasFields[alias] = value.fieldRef;
			}
		}
		const aggregate = aggregateExpressions.length > 0 ? {
			kind: "aggregate",
			expressions: aggregateExpressions
		} : void 0;
		const apply = groupByFields.length > 0 ? {
			kind: "groupby",
			fields: groupByFields,
			next: aggregate
		} : aggregate;
		return new ODataApplyQuery(this.#table, apply, aliasProxy, this.#filters.length > 0 ? this.#filters : void 0, aliasFields);
	}
	_buildForExpand() {
		return serializeODataSelect(this.toAst(), ";");
	}
	toAst() {
		return {
			kind: "select",
			select: this.#fields.map(toODataPath),
			filters: this.#filters.map(toODataFilterNode),
			orderby: this.#orderby.map((order) => ({
				field: toODataPath(order.field),
				direction: order.direction
			})),
			expands: this.#expands.map((expand) => ({
				navigation: expand.navigation.fromDataverseName,
				query: expand.query
			})),
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
		const ctx = {
			table: this.#table,
			client: this.#table.client,
			recordId: recordId ?? ""
		};
		for (const key of this.#selectedKeys) {
			const prop = this.#table.fields[key];
			result[key] = FieldRef.fromPath(prop, prop.fromDataverseName ?? prop.logicalName).transformFromDataverse(value[prop.fromDataverseName], ctx);
		}
		for (const expand of this.#expandMeta) if (value[expand.dvName] !== void 0) result[expand.key] = _processExpand(value[expand.dvName], expand, this.#table);
		result[ETAG] = value["@odata.etag"];
		return result;
	}
	_transformRow(value) {
		if (this.#selectedKeys.length > 0) return this._partialTransform(value);
		if (this.#expandMeta.some((e) => e.selectedKeys)) return this._partialTransform(value);
		return this.#table.transformValueFromDataverse(value);
	}
	async execute() {
		const results = [];
		for await (const page of this.iteratePages()) results.push(...page);
		return results;
	}
	async *iterate(options) {
		if (!this.toString()) {
			yield* this.#table.iterateRecords(void 0, options);
			return;
		}
		for await (const page of this.iteratePages(options)) yield* page;
	}
	async *iteratePages(options) {
		const qs = this.toString();
		if (!qs) {
			yield* this.#table.iteratePages(void 0, options);
			return;
		}
		for await (const page of this.#table.client.iteratePages(this.#table.entitySetName, {
			...options,
			query: qs
		})) yield page.map((v) => this._transformRow(v));
	}
};
var InitialQueryImpl = class {
	#table;
	constructor(table) {
		this.#table = table;
	}
	select(...keys) {
		const q = new ODataQuery(this.#table);
		if (keys.length === 0) q.select();
		else q.select(...keys);
		return q;
	}
	apply(expr) {
		return new ODataQuery(this.#table).apply(expr);
	}
};
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
		if (expand.selectedKeys) return items.map((item) => _partialTransformItem(relatedTable, expand.selectedKeys, item, expand.subExpands));
		else return navProp.transformValueFromDataverse(raw);
	} else if (expand.selectedKeys) return _partialTransformItem(relatedTable, expand.selectedKeys, raw, expand.subExpands);
	else return navProp.transformValueFromDataverse(raw);
}
function _partialTransformItem(table, selectedKeys, raw, subExpands) {
	const result = {};
	const recordId = raw[table.primaryKey.property.fromDataverseName] ?? raw[table.primaryKey.property.logicalName];
	const ctx = {
		table,
		client: table.client,
		recordId: recordId ?? ""
	};
	for (const key of selectedKeys) {
		const prop = table.fields[key];
		if (prop) result[key] = FieldRef.fromPath(prop, prop.fromDataverseName ?? prop.logicalName).transformFromDataverse(raw[prop.fromDataverseName], ctx);
	}
	if (subExpands) {
		for (const expand of subExpands) if (raw[expand.dvName] !== void 0) result[expand.key] = _processExpand(raw[expand.dvName], expand, table);
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
						Object.defineProperty(sub, "path", {
							value: [...prefixPath, navProp],
							enumerable: false
						});
						if (isCollection) proxyTableMap.set(sub, navProp.table);
						proxyPathMap.set(sub, [...prefixPath, navProp]);
						cached = sub;
					}
					return cached;
				},
				enumerable: true,
				configurable: true
			});
		} else proxy[key] = FieldRef.fromPath(prop, prefix ? `${prefix}/${dataverseName}` : dataverseName, [...prefixPath, prop]);
	}
	return proxy;
}
function buildLambdaProxy(alias, table) {
	const fields = table.fields;
	const proxy = {};
	for (const [key, prop] of Object.entries(fields)) proxy[key] = FieldRef.fromPath(prop, `${alias}/${prop.fromDataverseName ?? prop.logicalName}`);
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
		condition: result instanceof FilterExpr ? result.getNode() : {
			type: "raw",
			value: result
		}
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
		condition: result instanceof FilterExpr ? result.getNode() : {
			type: "raw",
			value: result
		}
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
	if (typeof options?.orderby === "string") for (const value of options.orderby.split(",")) {
		const [field, direction = "asc"] = value.trim().split(/\s+/);
		if (field) query.orderby(field, direction);
	}
	else for (const [field, direction] of Object.entries(options?.orderby ?? {})) {
		const property = table.fields[field]?.fromDataverseName ?? table.fields[field]?.logicalName ?? field;
		query.orderby(property, direction);
	}
	return query.toAst();
}

//#endregion
//#region src/table.ts
/**
* Represents a Dataverse table (entity) and provides methods for CRUD, querying,
* navigation properties, actions, functions, and bulk operations.
*
* Create instances via the constructor with an options object.
* All API calls go through the provided {@link DataverseClient}.
*
* @template TProperties An object mapping property names to their field definitions.
*
* @example
* const client = new DataverseClient({ url: "https://org.crm.dynamics.com" });
*
* const Account = new DataverseTable({
*   client,
*   entitySetName: "accounts",
*   logicalName: "account",
*   fields: {
*     id: primaryKey("accountid"),
*     name: string("name"),
*     revenue: number("revenue"),
*     primaryContact: lookup("primarycontactid", () => Contact),
*   },
* });
*
* // Type-safe queries
* const record = await Account.getRecord("GUID-HERE");
* console.log(record.name); // typed as string
*/
var DataverseTable = class DataverseTable {
	client;
	fields;
	logicalName;
	entitySetName;
	kind = "table";
	type = "table";
	/**
	* Whole-record valibot schema for this table — either the explicit
	* `schema` option or one composed from the individual field schemas.
	*/
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
		this.schema = options.schema ?? composeFieldSchemas(this.fields);
		if (options.primaryKey) this.primaryKey = options.primaryKey;
		else {
			const pk = Object.entries(this.fields).find((f) => f[1].type === "primaryKey");
			if (!pk) throw new Error("No Primary Key found in schema");
			this.primaryKey = {
				key: pk[0],
				property: pk[1]
			};
		}
	}
	getDefault(value) {
		const result = {};
		for (const [key, property] of Object.entries(this.fields)) if (value === void 0 || !(key in value)) result[key] = property.getDefault();
		else result[key] = value[key];
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
		}).then((v) => this.transformValueFromDataverse(v)).catch((err) => {
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
		}).then((values) => values.map((v) => this.transformValueFromDataverse(v)));
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
		for await (const record of this.client.iterateRecords(this.entitySetName, {
			...options,
			query: tableQuery(this, queryOptions)
		})) yield this.transformValueFromDataverse(record);
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
		for await (const page of this.client.iteratePages(this.entitySetName, {
			...options,
			query: tableQuery(this, queryOptions)
		})) yield page.map((v) => this.transformValueFromDataverse(v));
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
			return this.client.getPropertyValue(this.entitySetName, id, propertyName).then((v) => prop.transformValueFromDataverse(v));
		}
		if (prop.type === "collection" || prop.type === "collectionIds") return this.client.getAssociatedRecords(this.entitySetName, id, prop.schemaName, { query: tableQuery(prop.table, queryOptions) }).then((v) => prop.transformValueFromDataverse(v));
		if (prop.type === "lookup") return this.client.getAssociatedRecord(this.entitySetName, id, prop.schemaName, { query: tableQuery(prop.table, queryOptions) }).then((v) => prop.transformValueFromDataverse(v));
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
		const ctx = {
			table: this,
			client: this.client,
			recordId: id
		};
		if (prop.type === "lookupId") {
			const name = prop.navigationName;
			if (value === null) await this.client.dissociateRecord(this.entitySetName, id, name);
			else await this.client.associateRecord(this.entitySetName, id, name, prop.table.entitySetName, value);
		} else if (prop.kind === "navigation" && prop.afterSave) await prop.afterSave(ctx, value);
		else {
			let v = prop.transformValueToDataverse(value, ctx);
			if (v instanceof Promise) v = await v;
			if (v === SKIP) {
				if (prop.afterSave) await prop.afterSave(ctx, value);
			} else await this.client.updatePropertyValue(this.entitySetName, id, this.fields[key].logicalName, v);
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
		if (prop.kind === "navigation") return this.client.associateRecord(this.entitySetName, id, prop.schemaName, prop.table.entitySetName, childId);
		else throw new Error("Can only associate to navigation properties");
	}
	async dissociateRecord(key, id, childId) {
		const prop = this.fields[key];
		if (prop.kind === "navigation") return this.client.dissociateRecord(this.entitySetName, id, prop.schemaName, childId);
		else throw new Error("Can only dissociate navigation properties");
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
		const record = await this.client.postRecord(this.entitySetName, await this.transformValueToDataverse(value), {
			returnRepresentation: true,
			signal: options?.signal,
			query: tableQuery(this)
		});
		const transformed = this.transformValueFromDataverse(record);
		const guid = this.getPrimaryId(transformed);
		const ctx = {
			table: this,
			client: this.client,
			recordId: guid
		};
		await this._afterSave(ctx, value);
		return transformed;
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
	/**
	* Updates an existing record by ID. Supports optimistic concurrency via the
	* `ifMatch` option (If-Match header). When `ifMatch` is omitted it defaults
	* to `"*"`, which updates the record only if it already exists.
	*
	* Returns the full record as returned by Dataverse after the write
	* (transformed), including the fresh `$etag` and any server-computed fields.
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
		const ctx = {
			table: this,
			client: this.client,
			recordId: id
		};
		const result = await this.client.patchRecord(this.entitySetName, id, await this.transformValueToDataverse(value, ctx), {
			ifMatch: options?.ifMatch ?? "*",
			ifNoneMatch: options?.ifNoneMatch,
			signal: options?.signal,
			query: tableQuery(this)
		});
		await this._afterSave(ctx, value);
		return this.transformValueFromDataverse(result);
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
		const ctx = {
			table: this,
			client: this.client,
			recordId: id
		};
		if (!id) return this.createRecord(value, options);
		const transformed = await this.transformValueToDataverse(value, ctx);
		const record = await this.client.patchRecord(this.entitySetName, id, transformed, {
			ifMatch: options?.ifMatch,
			ifNoneMatch: options?.ifNoneMatch,
			signal: options?.signal,
			query: tableQuery(this)
		});
		const result = this.transformValueFromDataverse(record);
		ctx.recordId = this.getPrimaryId(result);
		await this._afterSave(ctx, value);
		return result;
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
		return this.client.deleteRecord(this.entitySetName, id, {
			ifMatch: options?.ifMatch,
			signal: options?.signal
		});
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
		if (prop.kind === "value") return this.client.deletePropertyValue(this.entitySetName, id, prop.logicalName);
		throw new Error("Cannot delete navigation property values");
	}
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
		if (id) return this.client.executeBoundAction(this.entitySetName, actionName, params, id);
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
	* Note: Dataverse always returns the primary key attribute in responses,
	* independent of `$select` — so this works even for tables whose `fields`
	* don't declare the pk.
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
		const ctx = recordId ? {
			table: this,
			client: this.client,
			recordId
		} : void 0;
		for (const [key, property] of Object.entries(this.fields)) {
			const raw = value[property.fromDataverseName];
			result[key] = property.transformValueFromDataverse(raw, ctx);
		}
		if (!(pk.key in result) && recordId !== void 0) result[pk.key] = recordId;
		result[ETAG] = value["@odata.etag"];
		return result;
	}
	async transformValueToDataverse(value, ctx) {
		if (value === null) return null;
		const result = {};
		for (const [key, property] of Object.entries(this.fields)) {
			if (property.getReadOnly() || !(key in value) || value[key] === void 0) continue;
			let v = property.transformValueToDataverse(value[key], ctx);
			if (v instanceof Promise) v = await v;
			if (v !== SKIP) result[property.toDataverseName] = v;
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
		const properties = Object.fromEntries(Object.entries(this.fields).filter((v) => keys.includes(v[0])));
		return new DataverseTable({
			client: this.client,
			entitySetName: this.entitySetName,
			logicalName: this.logicalName,
			fields: properties,
			primaryKey: this.primaryKey
		});
	}
	/**
	* Creates a new `DataverseTable` with the specified properties excluded.
	*
	* @example
	* const WithoutSensitive = Person.omitProperties("ssn");
	*/
	omitProperties(...keys) {
		const properties = Object.fromEntries(Object.entries(this.fields).filter((v) => !keys.includes(v[0])));
		return new DataverseTable({
			client: this.client,
			entitySetName: this.entitySetName,
			logicalName: this.logicalName,
			fields: properties,
			primaryKey: this.primaryKey
		});
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
		return new DataverseTable({
			client: this.client,
			entitySetName: this.entitySetName,
			logicalName: this.logicalName,
			primaryKey: this.primaryKey,
			fields: {
				...this.fields,
				...properties
			}
		});
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
		for (const [key, property] of Object.entries(this.fields)) if (key in value && value[key] !== void 0 && property.afterSave) promises.push(property.afterSave(ctx, value[key]));
		await Promise.all(promises);
	}
	/** Use for type inference: `Infer<typeof Account>` resolves to the record type. */
	T;
};
/**
* Composes a whole-record valibot schema from the individual field schemas.
* Used as the default table schema when no explicit `schema` option is given.
*/
function composeFieldSchemas(fields) {
	const shape = {};
	for (const [key, field] of Object.entries(fields)) shape[key] = field.schema;
	return v.object(shape);
}
function tableQuery(table, options) {
	return serializeODataSelect(buildTableQueryAst(table, options));
}
/**
* Represents a Dataverse many-to-many intersect (association) table.
*
* This is a simple descriptor for use with FetchXML's {@link EntityQueryBuilder.join join()}
* method. It does NOT extend {@link DataverseTable} — it is not a queryable entity on its own.
*
* @example
* const AccountContact = new DataverseIntersectTable("accountcontact", Account, Contact);
*
* // Use in FetchXML via join():
* fetchXml(Account)
*   .select(f => ({ name: f.name }))
*   .join("inner", AccountContact, sub =>
*     sub.select(f => ({ accountName: f.name }))
*   )
*/
var DataverseIntersectTable = class {
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
};

//#endregion
//#region src/fields.ts
const DATE_SCHEMA = v.date();
const NON_EMPTY_STRING_SCHEMA = v.pipe(v.string(), v.minLength(1));
function isValidDate(value) {
	return v.safeParse(DATE_SCHEMA, value).success;
}
function parseValidDateOnly(value) {
	if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}/.test(value)) throw new Error(`Invalid date-only value: ${value}`);
	const text = value;
	const result = parseDateOnly(text);
	const [year, month, day] = text.slice(0, 10).split("-").map(Number);
	if (!isValidDate(result) || result.getFullYear() !== year || result.getMonth() !== month - 1 || result.getDate() !== day) throw new Error(`Invalid date-only value: ${text}`);
	return result;
}
const SKIP = Symbol("skip");
/**
* Base class for all Dataverse column and navigation property definitions.
*
* ## Transform contract
* - `transformValueFromDataverse(value, ctx?)` converts a raw API payload into the
*   typed record value. Dataverse represents empty columns as explicit `null` (or
*   omits the key entirely); non-nullable fields fold both into their field default.
*   Use the `nullable*` variants to preserve empties as `null`. Values that are
*   present but malformed still throw.
* - `transformValueToDataverse(value, ctx?)` converts a record value into its API
*   payload. It may return synchronously or return a `Promise`. Returning the
*   {@link SKIP} symbol excludes the value from the request body (used by file/image
*   columns whose content is uploaded separately).
* - `afterSave(ctx, value)` runs after a create/update when the key was present in
*   the submitted value. File/image fields use it as the explicit data channel:
*   they only act when `value.data` is a `Blob` (upload) or exactly `null` (clear).
*
* Fields created with `readonly: true` are never included in request bodies,
* `updatePropertyValue`, or `deletePropertyValue`.
*/
var FieldBase = class {
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
};
function buildObjectSchema(fields) {
	const shape = {};
	for (const [key, field] of Object.entries(fields)) shape[key] = field.schema;
	return v.object(shape);
}
var BooleanField = class extends FieldBase {
	kind = "value";
	type = "boolean";
	constructor(name, options) {
		super(name, {
			defaultValue: false,
			schema: v.boolean()
		}, options);
	}
	transformValueFromDataverse(value) {
		if (typeof value === "string") return value.toLowerCase() === "true";
		return value ?? false;
	}
};
var NullableBooleanField = class extends FieldBase {
	kind = "value";
	type = "boolean";
	constructor(name, options) {
		super(name, {
			defaultValue: null,
			schema: v.nullable(v.boolean())
		}, options);
	}
	transformValueFromDataverse(value) {
		if (typeof value === "string") return value.toLowerCase() === "true";
		return value ?? null;
	}
};
var NumberField = class extends FieldBase {
	kind = "value";
	type = "number";
	constructor(name, options) {
		super(name, {
			defaultValue: 0,
			schema: v.number()
		}, options);
	}
	transformValueFromDataverse(value) {
		if (typeof value === "string") {
			const n = Number(value);
			return Number.isFinite(n) ? n : 0;
		}
		return value ?? 0;
	}
};
var NullableNumberField = class extends FieldBase {
	kind = "value";
	type = "number";
	constructor(name, options) {
		super(name, {
			defaultValue: null,
			schema: v.nullable(v.number())
		}, options);
	}
	transformValueFromDataverse(value) {
		if (typeof value === "string") {
			const n = Number(value);
			return Number.isFinite(n) ? n : null;
		}
		return value ?? null;
	}
};
var StringField = class extends FieldBase {
	kind = "value";
	type = "string";
	constructor(name, options) {
		super(name, {
			defaultValue: "",
			schema: v.string()
		}, options);
	}
	transformValueFromDataverse(value) {
		return value ?? "";
	}
};
var NullableStringField = class extends FieldBase {
	kind = "value";
	type = "string";
	constructor(name, options) {
		super(name, {
			defaultValue: null,
			schema: v.nullable(v.string())
		}, options);
	}
	transformValueFromDataverse(value) {
		return value ?? null;
	}
};
var PrimaryKeyField = class extends FieldBase {
	kind = "value";
	type = "primaryKey";
	constructor(name, options) {
		super(name, {
			defaultValue: "",
			schema: v.pipe(v.string(), v.uuid())
		}, options);
	}
	getDefault() {
		return super.getDefault() || crypto.randomUUID();
	}
};
var ListField = class extends FieldBase {
	kind = "value";
	type = "list";
	list;
	constructor(name, list, options) {
		const values = Object.freeze([...list]);
		super(name, {
			defaultValue: null,
			schema: v.nullable(v.custom((value) => values.includes(value), `Value not in [${values}]`))
		}, options);
		this.list = values;
	}
};
/**
* Field for Dataverse multi-select choice (MultiSelectPicklist) columns.
*
* The Web API stores these as a comma-delimited string of option values
* (e.g. `"3,4,5"`). This field transforms that string to a `number[]` when
* reading and back to a CSV string when writing. An empty selection reads as
* `[]` and writes as `null` (which clears the column).
*
* @example
* const table = new DataverseTable({
*   months: multiChoice("nnsyc200_months", [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]),
* });
* // Infer<typeof table>["months"] → number[]
*/
var MultiChoiceField = class extends FieldBase {
	kind = "value";
	type = "multiChoice";
	choices;
	constructor(name, choices, options) {
		const values = (Array.isArray(choices) ? [...choices] : Object.keys(choices).map(Number)).sort((a, b) => a - b);
		if (values.length === 0) throw new Error("Multi-choice fields require at least one value");
		super(name, {
			defaultValue: [],
			schema: v.array(v.custom((value) => values.includes(value), `Value not in [${values}]`))
		}, options);
		this.choices = Object.freeze(values);
	}
	getDefault() {
		return [...super.getDefault()];
	}
	transformValueFromDataverse(value) {
		if (value == null || value === "") return [];
		if (Array.isArray(value)) return value.map((v) => Number(v));
		return String(value).split(",").map((part) => Number(part.trim())).filter((n) => !Number.isNaN(n));
	}
	transformValueToDataverse(value) {
		if (value == null) return null;
		const arr = Array.isArray(value) ? value : [value];
		if (arr.length === 0) return null;
		return arr.map((v) => Number(v)).join(",");
	}
};
var ChoiceField = class extends FieldBase {
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
			schema: v.picklist(values)
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
		for (const [k, v] of Object.entries(this.#choices)) if (v === value) return Number(k);
		throw new Error(`Unknown choice label: ${value}`);
	}
};
var NullableChoiceField = class extends FieldBase {
	kind = "value";
	type = "choice";
	/** Allowed labels (values of the choice map), frozen. */
	choices;
	#choices;
	constructor(name, choices, options) {
		if (Object.keys(choices).length === 0) throw new Error("Choice fields require at least one option");
		const values = Object.values(choices);
		super(name, {
			defaultValue: null,
			schema: v.nullable(v.picklist(values))
		}, options);
		this.#choices = choices;
		this.choices = Object.freeze([...values]);
	}
	transformValueFromDataverse(value) {
		if (value === null) return null;
		const result = this.#choices[value];
		if (result === void 0) throw new Error(`Unknown choice value: ${value} (${this.logicalName})`);
		return result;
	}
	transformValueToDataverse(value) {
		if (value === null) return null;
		for (const [k, v] of Object.entries(this.#choices)) if (v === value) return Number(k);
		throw new Error(`Unknown choice label: ${value}`);
	}
};
var DateTimeField = class extends FieldBase {
	kind = "value";
	type = "dateTime";
	constructor(name, options) {
		super(name, {
			defaultValue: /* @__PURE__ */ new Date(),
			schema: v.instance(Date)
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
};
var NullableDateTimeField = class extends FieldBase {
	kind = "value";
	type = "dateTime";
	constructor(name, options) {
		super(name, {
			defaultValue: null,
			schema: v.nullable(v.instance(Date))
		}, options);
	}
	transformValueFromDataverse(value) {
		if (value === null) return null;
		if (value === void 0) return null;
		const result = new Date(value);
		if (!isValidDate(result)) throw new Error(`Invalid datetime value: ${value}`);
		return result;
	}
};
var DateField = class extends FieldBase {
	kind = "value";
	type = "dateOnly";
	constructor(name, options) {
		super(name, {
			defaultValue: parseDateOnly((/* @__PURE__ */ new Date()).toISOString()),
			schema: v.instance(Date)
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
};
var NullableDateField = class extends FieldBase {
	kind = "value";
	type = "dateOnly";
	constructor(name, options) {
		super(name, {
			defaultValue: null,
			schema: v.nullable(v.instance(Date))
		}, options);
	}
	transformValueFromDataverse(value) {
		if (value == null) return null;
		return parseValidDateOnly(value);
	}
	transformValueToDataverse(value) {
		if (value === null || value === void 0) return null;
		if (!(value instanceof Date) || !isValidDate(value)) throw new Error("Invalid date value");
		return toDateOnly(value);
	}
};
/**
* Field for retrieving user-localized display values
* (e.g. `...@OData.Community.Display.V1.FormattedValue`). Always read-only:
* the value is computed by Dataverse and can never be written or deleted.
*/
var FormattedField = class extends FieldBase {
	kind = "value";
	type = "formatted";
	constructor(name, options) {
		super(name, {
			defaultValue: null,
			schema: v.nullable(v.string())
		}, {
			...options,
			readonly: true
		});
		this.fromDataverseName = `${name}@OData.Community.Display.V1.FormattedValue`;
	}
};
/**
* Field for Dataverse image columns.
*
* The column value itself is server-managed: `transformValueToDataverse` returns
* {@link SKIP} so the field is never part of a create/update body. Instead, data
* flows through the explicit channel in `afterSave`: include `{ data }` in the
* record value where `data` is a `Blob` to upload or exactly `null` to clear the
* image. Reading returns `{ url, fullSizeUrl? }`.
*/
var ImageField = class extends FieldBase {
	kind = "value";
	type = "image";
	constructor(name, options) {
		super(name, {
			defaultValue: null,
			schema: v.nullable(v.object({
				url: v.optional(v.string()),
				fullSizeUrl: v.optional(v.string()),
				data: v.optional(v.nullable(v.instance(Blob)))
			}))
		}, options);
	}
	transformValueFromDataverse(value, ctx) {
		if (value == null) return null;
		const b64 = String(value);
		const url = `data:${b64.startsWith("/9j/") ? "image/jpeg" : b64.startsWith("iVB") ? "image/png" : b64.startsWith("R0lG") ? "image/gif" : "application/octet-stream"};base64,${b64}`;
		if (!ctx) return { url };
		return {
			url,
			fullSizeUrl: ctx.client.getImageFullSizeURL(ctx.table.entitySetName, ctx.recordId, this.logicalName)
		};
	}
	async transformValueToDataverse(_value, _ctx) {
		return SKIP;
	}
	async afterSave(ctx, value) {
		if (value?.data === null) await ctx.client.deletePropertyValue(ctx.table.entitySetName, ctx.recordId, this.logicalName);
		else if (value?.data instanceof Blob) await ctx.client.updateFileProperty(ctx.table.entitySetName, ctx.recordId, this.logicalName, "image.png", value.data);
	}
};
/**
* Field for Dataverse file columns.
*
* The column value itself is server-managed: `transformValueToDataverse` returns
* {@link SKIP} so the field is never part of a create/update body. Instead, data
* flows through the explicit channel in `afterSave`: include `{ name?, data }` in
* the record value where `data` is a `Blob` to upload or exactly `null` to clear
* the file. Reading returns `{ name, url? }`.
*/
var FileField = class extends FieldBase {
	kind = "value";
	type = "file";
	constructor(name, options) {
		super(name, {
			defaultValue: null,
			schema: v.nullable(v.object({
				name: v.optional(v.string()),
				url: v.optional(v.string()),
				data: v.optional(v.nullable(v.instance(Blob)))
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
			if (fileName) await ctx.client.updateFileProperty(ctx.table.entitySetName, ctx.recordId, this.logicalName, fileName, value.data);
		} else if (value?.data === null) await ctx.client.deletePropertyValue(ctx.table.entitySetName, ctx.recordId, this.logicalName);
	}
};
var JsonField = class extends FieldBase {
	kind = "value";
	type = "json";
	constructor(name, options) {
		super(name, {
			defaultValue: void 0,
			schema: options.schema
		}, options);
	}
	transformValueFromDataverse(value) {
		if (value == null) return this.getDefault();
		const raw = typeof value === "string" ? JSON.parse(value) : value;
		return v.parse(this.schema, raw);
	}
	transformValueToDataverse(value) {
		if (value == null) return null;
		return JSON.stringify(value);
	}
};
/**
* Creates a boolean-typed Dataverse column definition.
*
* @param name The Dataverse logical name of the column (e.g. `"is_active"`).
*
* @example
* const table = new DataverseTable({
*   isActive: boolean("is_active"),
* });
* // Infer<typeof table>["isActive"] → boolean
*/
function boolean(name, options) {
	return new BooleanField(name, options);
}
function nullableBoolean(name, options) {
	return new NullableBooleanField(name, options);
}
/**
* Creates a number-typed Dataverse column definition.
*
* @param name The Dataverse logical name of the column (e.g. `"person_age"`).
*
* @example
* const table = new DataverseTable({
*   age: number("person_age"),
* });
* // Infer<typeof table>["age"] → number
*/
function number(name, options) {
	return new NumberField(name, options);
}
/**
* Creates a nullable number column definition (allows `null`).
*
* @param name The Dataverse logical name of the column.
*
* @example
* const table = new DataverseTable({
*   age: nullableNumber("person_age"),
* });
* // Infer<typeof table>["age"] → number | null
*/
function nullableNumber(name, options) {
	return new NullableNumberField(name, options);
}
/**
* Creates a string-typed Dataverse column definition.
*
* @param name The Dataverse logical name of the column (e.g. `"fullname"`).
*
* @example
* const table = new DataverseTable({
*   name: string("fullname"),
* });
* // Infer<typeof table>["name"] → string
*/
function string(name, options) {
	return new StringField(name, options);
}
/**
* Creates a nullable string column definition (allows `null`).
*
* @param name The Dataverse logical name of the column.
*
* @example
* const table = new DataverseTable({
*   middleName: nullableString("middlename"),
* });
* // Infer<typeof table>["middleName"] → string | null
*/
function nullableString(name, options) {
	return new NullableStringField(name, options);
}
/**
* Creates a primary key (GUID) column definition for a Dataverse table.
*
* @param name The Dataverse logical name of the primary key column (e.g. `"contactid"`).
*
* @example
* const table = new DataverseTable({
*   id: primaryKey("contactid"),
* });
* // Infer<typeof table>["id"] → `${string}-${string}-${string}-${string}-${string}`
*/
function primaryKey(name, options) {
	return new PrimaryKeyField(name, options);
}
/**
* Creates a choice/option-set column definition with a fixed set of allowed values.
*
* @param name The Dataverse logical name of the column.
* @param list The array of allowed string or numeric values.
*
* @example
* const table = new DataverseTable({
*   gender: list("gendercode", [1, 2]),
* });
* // Infer<typeof table>["gender"] → 1 | 2 | null
*/
function list(name, list, options) {
	return new ListField(name, list, options);
}
/**
* Creates a multi-select choice column definition (MultiSelectPicklist).
* Reads the Dataverse CSV format (`"3,4,5"`) as a `number[]` and writes
* arrays back as CSV. An empty selection writes `null` (clears the column).
*
* @param name The Dataverse logical name of the column.
* @param choices The allowed numeric option values (or a value→label map).
*
* @example
* const table = new DataverseTable({
*   months: multiChoice("nnsyc200_months", [1, 2, 3]),
* });
* // Infer<typeof table>["months"] → number[]
*/
function multiChoice(name, choices, options) {
	return new MultiChoiceField(name, choices, options);
}
/**
* Creates a choice/option-set column definition. Maps Dataverse numeric option values
* to human-readable string labels.
*
* @param name The Dataverse logical name of the column.
* @param choices An object mapping numeric option values to string labels.
* @param options Optional field options (default, readonly, schema).
*
* @example
* const table = new DataverseTable({
*   status: choice("statuscode", { 1: "Active", 2: "Inactive", 3: "Archived" }),
* });
* // Infer<typeof table>["status"] → "Active" | "Inactive" | "Archived"
*/
function choice(name, choices, options) {
	return new ChoiceField(name, choices, options);
}
/**
* Creates a nullable choice/option-set column definition (allows `null`).
*
* @param name The Dataverse logical name of the column.
* @param choices An object mapping numeric option values to string labels.
* @param options Optional field options (default, readonly, schema).
*
* @example
* const table = new DataverseTable({
*   priority: nullableChoice("prioritycode", { 1: "Low", 2: "High" }),
* });
* // Infer<typeof table>["priority"] → "Low" | "High" | null
*/
function nullableChoice(name, choices, options) {
	return new NullableChoiceField(name, choices, options);
}
/**
* Creates a date-time column definition (maps to JavaScript `Date`).
*
* @param name The Dataverse logical name of the column.
*
* @example
* const table = new DataverseTable({
*   createdAt: datetime("createdon"),
* });
* // Infer<typeof table>["createdAt"] → Date
*/
function datetime(name, options) {
	return new DateTimeField(name, options);
}
/**
* Creates a date-only column definition (maps to JavaScript `Date`, time portion is zeroed).
*
* @param name The Dataverse logical name of the column.
*
* @example
* const table = new DataverseTable({
*   birthDate: date("birthdate"),
* });
* // Infer<typeof table>["birthDate"] → Date
*/
function date(name, options) {
	return new DateField(name, options);
}
/**
* Creates a nullable date-only column definition (allows `null`).
*
* @param name The Dataverse logical name of the column.
*/
function nullableDate(name, options) {
	return new NullableDateField(name, options);
}
/**
* Creates a nullable date-time column definition (allows `null`).
*
* @param name The Dataverse logical name of the column.
*/
function nullableDateTime(name, options) {
	return new NullableDateTimeField(name, options);
}
/**
* Creates a formatted-value column definition for retrieving user-localized display values
* (e.g. for option-set labels). These are read-only.
*
* @param name The Dataverse logical name of the column.
*
* @example
* const table = new DataverseTable({
*   statusLabel: formatted("statuscode"),
* });
*/
function formatted(name, options) {
	return new FormattedField(name, options);
}
/**
* Creates an image column definition.
*
* @param name The Dataverse logical name of the image column.
*/
function image(name, options) {
	return new ImageField(name, options);
}
/**
* Creates a file column definition. The column value is server-managed; upload or
* clear file contents through the explicit `{ name?, data }` channel.
*
* @param name The Dataverse logical name of the file column.
*/
function file(name, options) {
	return new FileField(name, options);
}
/**
* Creates a JSON-typed Dataverse column definition. Stores JSON as a text column
* in Dataverse and parses/validates it using the provided valibot schema.
*
* @param name The Dataverse logical name of the column.
* @param options Field options; `schema` (a valibot schema validating the parsed
* JSON structure) is required, plus the standard default/readonly options.
*
* @example
* const Address = v.object({ street: v.string(), city: v.string() });
* const table = new DataverseTable({
*   address: json("address_data", { schema: Address }),
* });
* // Infer<typeof table>["address"] → { street: string; city: string }
*/
function json(name, options) {
	return new JsonField(name, options);
}
var LookupIdProperty = class extends FieldBase {
	kind = "navigation";
	type = "lookupId";
	#getTable;
	constructor(name, getTable, options) {
		super(name, {
			defaultValue: null,
			schema: v.nullable(NON_EMPTY_STRING_SCHEMA)
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
			this.#table = new DataverseTable({
				client: table.client,
				entitySetName: table.entitySetName,
				logicalName: table.logicalName,
				fields: { id: property }
			});
		}
		return this.#table;
	}
	transformValueToDataverse(value) {
		if (value === null) return null;
		if (typeof value !== "string" || value.length === 0) throw new Error("Lookup IDs must be non-empty strings");
		return `${this.table.entitySetName}(${value})`;
	}
};
var CollectionProperty = class extends FieldBase {
	kind = "navigation";
	type = "collection";
	#getTable;
	constructor(name, getTable, options) {
		super(name, {
			defaultValue: [],
			schema: v.array(v.lazy(() => buildObjectSchema(getTable().fields)))
		}, options);
		this.#getTable = getTable;
		this.fromDataverseName = this.schemaName;
	}
	#table;
	get table() {
		return this.#table ??= this.#getTable();
	}
	transformValueFromDataverse(value) {
		return Array.from(value ?? []).map((v) => this.table.transformValueFromDataverse(v));
	}
	transformValueToDataverse() {
		return SKIP;
	}
	async afterSave(ctx, value) {
		if (!Array.isArray(value)) return;
		const ids = await Promise.all(value.map((v) => this.table.upsertRecord(void 0, v).then((r) => this.table.getPrimaryId(r))));
		await ctx.client.associateRecordToList(ctx.table.entitySetName, ctx.recordId, this.schemaName, this.table.entitySetName, this.table.primaryKey.property.logicalName, ids);
	}
};
/**
* Creates a one-to-many (collection) navigation property definition. The related records
* can be expanded via OData `$expand` or fetched through the table API.
*
* The thunk is strongly typed so the related records appear in `Infer<typeof table>`.
* Note: if two tables reference each other through the typed navigation factories
* (`collection`/`lookup`) on **both** ends, TypeScript cannot implicitly infer the
* mutually recursive types (TS7022) — break the cycle by using `collectionIds` or
* `lookupId` (untyped thunks) for one direction, or annotate one table explicitly.
*
* @param name The Dataverse logical name of the collection navigation property.
* @param getTable A thunk that returns the related table definition.
*
* @example
* const Address = new DataverseTable({
*   client, entitySetName: "addresses", logicalName: "address",
*   fields: { id: primaryKey("addressid"), street: string("street") },
* });
* const Person = new DataverseTable({
*   client, entitySetName: "people", logicalName: "person",
*   fields: {
*     id: primaryKey("personid"),
*     addresses: collection("person_addresses", () => Address),
*   },
* });
* // Infer<typeof Person>["addresses"] → { id: GUID; street: string }[]
*/
function collection(name, getTable, options) {
	return new CollectionProperty(name, getTable, options);
}
var CollectionIdsProperty = class extends FieldBase {
	kind = "navigation";
	type = "collectionIds";
	#getTable;
	constructor(name, getTable, options) {
		super(name, {
			defaultValue: [],
			schema: v.array(NON_EMPTY_STRING_SCHEMA)
		}, options);
		this.#getTable = getTable;
		this.fromDataverseName = this.schemaName;
	}
	#table;
	get table() {
		if (!this.#table) {
			const table = this.#getTable();
			const { property } = table.primaryKey;
			this.#table = new DataverseTable({
				client: table.client,
				entitySetName: table.entitySetName,
				logicalName: table.logicalName,
				fields: { id: property }
			});
		}
		return this.#table;
	}
	transformValueFromDataverse(value) {
		return Array.from(value ?? []).map((v) => v[this.table.fields.id.logicalName]);
	}
	transformValueToDataverse() {
		return SKIP;
	}
	async afterSave(ctx, value) {
		if (!Array.isArray(value)) return;
		await ctx.client.associateRecordToList(ctx.table.entitySetName, ctx.recordId, this.schemaName, this.table.entitySetName, this.table.primaryKey.property.logicalName, value);
	}
};
/**
* Creates a collection-of-IDs navigation property definition. Unlike a full collection,
* this only stores the related record IDs (GUIDs), not the full records.
*
* @param name The Dataverse logical name of the navigation property.
* @param getTable A thunk that returns the related table definition. It is
* intentionally untyped (`GetTable` → `() => any`): the related table only
* contributes GUIDs here, and keeping the thunk non-generic lets two tables
* reference each other without creating a TypeScript inference cycle.
*
* @example
* const Address = new DataverseTable({
*   client, entitySetName: "addresses", logicalName: "address",
*   fields: { id: primaryKey("addressid") },
* });
* const Person = new DataverseTable({
*   client, entitySetName: "people", logicalName: "person",
*   fields: {
*     id: primaryKey("personid"),
*     addressIds: collectionIds("person_addresses", () => Address),
*   },
* });
* // Infer<typeof Person>["addressIds"] → `${string}-${string}-${string}-${string}-${string}`[]
*/
function collectionIds(name, getTable, options) {
	return new CollectionIdsProperty(name, getTable, options);
}
/**
* Creates a lookup-ID navigation property definition. This stores only the foreign-key
* GUID of the related record (not the full expanded record).
*
* @param name The Dataverse logical name of the lookup column.
* @param getTable A thunk that returns the related table definition. It is
* intentionally untyped (`GetTable` → `() => any`): the related table only
* contributes a GUID here, and keeping the thunk non-generic lets two tables
* reference each other without creating a TypeScript inference cycle.
*
* @example
* const Address = new DataverseTable({
*   client, entitySetName: "addresses", logicalName: "address",
*   fields: { id: primaryKey("addressid") },
* });
* const Person = new DataverseTable({
*   client, entitySetName: "people", logicalName: "person",
*   fields: {
*     id: primaryKey("personid"),
*     primaryAddressId: lookupId("primaryaddressid", () => Address),
*   },
* });
* // Infer<typeof Person>["primaryAddressId"] → `${string}-${string}-${string}-${string}-${string}` | null
*/
function lookupId(name, getTable, options) {
	return new LookupIdProperty(name, getTable, options);
}
var LookupProperty = class extends FieldBase {
	kind = "navigation";
	type = "lookup";
	#getTable;
	constructor(name, getTable, options) {
		super(name, {
			defaultValue: null,
			schema: v.nullable(v.lazy(() => buildObjectSchema(getTable().fields)))
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
		if (value === null) await ctx.client.dissociateRecord(ctx.table.entitySetName, ctx.recordId, this.schemaName);
		else {
			const childId = this.table.getPrimaryId(await this.table.upsertRecord(void 0, value));
			await ctx.client.associateRecord(ctx.table.entitySetName, ctx.recordId, this.schemaName, this.table.entitySetName, childId);
		}
	}
};
/**
* Creates a many-to-one (lookup) navigation property definition. The related record
* can be expanded via OData `$expand` or fetched through the table API.
*
* The thunk is strongly typed so the related record appears in `Infer<typeof table>`.
* Note: if two tables reference each other through the typed navigation factories
* (`lookup`/`collection`) on **both** ends, TypeScript cannot implicitly infer the
* mutually recursive types (TS7022) — break the cycle by using `lookupId` or
* `collectionIds` (untyped thunks) for one direction, or annotate one table explicitly.
*
* @param name The Dataverse logical name of the lookup column.
* @param getTable A thunk that returns the related table definition.
*
* @example
* const Address = new DataverseTable({
*   client, entitySetName: "addresses", logicalName: "address",
*   fields: { id: primaryKey("addressid") },
* });
* const Person = new DataverseTable({
*   client, entitySetName: "people", logicalName: "person",
*   fields: {
*     id: primaryKey("personid"),
*     primaryAddress: lookup("primaryaddressid", () => Address),
*   },
* });
* // Infer<typeof Person>["primaryAddress"] → { id: GUID; ... } | null
*/
function lookup(name, getTable, options) {
	return new LookupProperty(name, getTable, options);
}

//#endregion
//#region src/query/shared/proxy.ts
function buildFlatFieldProxy(table) {
	const proxy = {};
	for (const [key, property] of Object.entries(table.fields)) proxy[key] = new FieldRef(property);
	return proxy;
}

//#endregion
//#region src/query/fetchxml/builder.ts
function fetchAttributeAst(attribute) {
	return { ...attribute };
}
function fetchOrderAst(order) {
	return { ...order };
}
var FilterCollector = class {
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
};
var FetchXmlAggregateQuery = class {
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
		for (const attr of initialAttributes ?? []) this._aliasProxy[attr.alias] = attr.alias;
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
			if (intersectTable.table1 === this._table) targetTable = intersectTable.table2;
			else if (intersectTable.table2 === this._table) targetTable = intersectTable.table1;
			else throw new Error(`Table "${this._table.entitySetName}" is not related to intersect table "${intersectTable.name}"`);
			const targetBuilder = new EntityQueryBuilder(targetTable, this._linkAlias);
			subqueryFn(targetBuilder);
			const pkName = this._table.primaryKey.property.logicalName;
			const targetPkName = targetTable.primaryKey.property.logicalName;
			const stubTable = {
				name: intersectTable.name,
				fields: {},
				client: this._table.client
			};
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
			this._orders.push({
				attribute: name,
				descending: dir === "desc"
			});
		} else {
			const entityname = args[0];
			const attribute = args[1];
			const direction = args[2];
			this._orders.push({
				attribute,
				entityname,
				descending: direction === "desc"
			});
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
			for (const c of this._filters) lines.push(`      ${c}`);
			lines.push(`    </filter>`);
		}
		for (const link of this._links) lines.push(...this._renderLinkEntity(link, "    "));
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
			const ctx = {
				table: this._table,
				client: this._table.client,
				recordId
			};
			for (const [alias, info] of aliasInfo) if (info.name in v) result[alias] = info.field ? info.field.transformFromDataverse(v[info.name], ctx) : v[info.name];
			else result[alias] = info.getDefault();
			result[ETAG] = v["@odata.etag"];
			return result;
		}
		return this._table.transformValueFromDataverse(v);
	}
	async execute(options) {
		this._applyExecuteOptions(options);
		const results = [];
		for await (const page of this.iteratePages(options)) results.push(...page);
		return results;
	}
	async *iterate(options) {
		this._applyExecuteOptions(options);
		for await (const page of this.iteratePages(options)) yield* page;
	}
	async *iteratePages(options) {
		this._applyExecuteOptions(options);
		for await (const page of this._table.client.iteratePages(this._table.entitySetName, {
			...options,
			query: this.toString()
		})) yield page.map((v) => this._transformRow(v));
	}
	_buildAliasInfo() {
		const map = /* @__PURE__ */ new Map();
		this._collectAliases(this, map);
		return map;
	}
	_collectAliases(builder, map) {
		for (const attr of builder._getEffectiveAttributes()) {
			const fields = builder._table.fields;
			const entry = Object.entries(fields).find(([_, f]) => (f.fromDataverseName ?? f.logicalName) === attr.name);
			if (entry) {
				const fieldDef = entry[1];
				const dataverseName = fieldDef.fromDataverseName ?? fieldDef.logicalName;
				map.set(attr.alias, {
					field: FieldRef.fromPath(fieldDef, dataverseName),
					getDefault: () => fieldDef.getDefault?.(),
					name: attr.alias
				});
			} else map.set(attr.alias, {
				field: void 0,
				getDefault: () => void 0,
				name: attr.name
			});
		}
		for (const link of builder._links) if (!(link.builder instanceof FilterCollector)) {
			if (!EntityQueryBuilder._isFilterOnlyLinkType(link.linkType)) {
				const eb = link.builder;
				this._collectAliasesFromBuilder(eb, map);
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
			for (const c of builderFilters) lines.push(`${childIndent}  ${c}`);
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
			for (const nestedLink of eb._links) lines.push(...this._renderLinkEntity(nestedLink, childIndent));
		}
		lines.push(`${indent}</link-entity>`);
		return lines;
	}
	_collectAliasesFromBuilder(builder, map) {
		for (const attr of builder._getEffectiveAttributes()) {
			const fields = builder._table.fields;
			const entry = Object.entries(fields).find(([_, f]) => (f.fromDataverseName ?? f.logicalName) === attr.name);
			if (entry) {
				const fieldDef = entry[1];
				const dataverseName = fieldDef.fromDataverseName ?? fieldDef.logicalName;
				map.set(attr.alias, {
					field: FieldRef.fromPath(fieldDef, dataverseName),
					getDefault: () => fieldDef.getDefault?.(),
					name: attr.alias
				});
			} else map.set(attr.alias, {
				field: void 0,
				getDefault: () => void 0,
				name: attr.name
			});
		}
		for (const link of builder._links) if (!EntityQueryBuilder._isFilterOnlyLinkType(link.linkType)) this._collectAliasesFromBuilder(link.builder, map);
	}
};
var EntityQueryBuilder = class EntityQueryBuilder {
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
			if (p.kind === "value" || p.type === "lookupId") attrs.push({
				name: p.logicalName,
				alias: key
			});
		}
		return attrs;
	}
	_buildProxy() {
		return buildFlatFieldProxy(this._table);
	}
	select(selector) {
		if (this._isAggregate) throw new Error("select() is not supported after apply()");
		const fieldsMock = {};
		for (const key of Object.keys(this._table.fields)) fieldsMock[key] = key;
		const selectedMap = selector(fieldsMock);
		for (const [alias, propKey] of Object.entries(selectedMap)) {
			const fieldDef = this._table.fields[propKey];
			this._attributes.push({
				name: fieldDef.logicalName,
				alias
			});
		}
		return this;
	}
	apply(expr) {
		const result = expr(this._proxy);
		const initialAttributes = [];
		for (const [alias, value] of Object.entries(result)) if (value instanceof GroupByExpr) initialAttributes.push({
			name: value.field,
			alias,
			groupby: true
		});
		else if (value instanceof Aggregation) {
			const fieldName = value.field ? value.field.toString() : this._table.primaryKey.property.logicalName;
			const operation = value.operation === "average" ? "avg" : value.operation;
			initialAttributes.push({
				name: fieldName,
				alias,
				aggregate: operation
			});
		}
		this._attributes = initialAttributes;
		return this;
	}
	_toAggregateQuery() {
		const q = new FetchXmlAggregateQuery(this._table, this._attributes, this._linkAlias, [...this._filters]);
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
			if (intersectTable.table1 === this._table) targetTable = intersectTable.table2;
			else if (intersectTable.table2 === this._table) targetTable = intersectTable.table1;
			else throw new Error(`Table "${this._table.entitySetName}" is not related to intersect table "${intersectTable.name}"`);
			const targetBuilder = new EntityQueryBuilder(targetTable, this._linkAlias);
			subqueryFn(targetBuilder);
			const pkName = this._table.primaryKey.property.logicalName;
			const targetPkName = targetTable.primaryKey.property.logicalName;
			const stubTable = {
				name: intersectTable.name,
				fields: {},
				client: this._table.client
			};
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
		if (EntityQueryBuilder._isFilterOnlyLinkType(linkType)) {
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
			this._orders.push({
				attribute: name,
				descending: dir === "desc"
			});
		} else {
			const entityname = args[0];
			const attribute = args[1];
			const direction = args[2];
			this._orders.push({
				attribute,
				entityname,
				descending: direction === "desc"
			});
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
			for (const c of this._filters) lines.push(`      ${c}`);
			lines.push(`    </filter>`);
		}
		for (const link of this._links) lines.push(...this._renderLinkEntity(link, "    "));
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
			for (const c of builderFilters) lines.push(`${childIndent}  ${c}`);
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
			const ebLinks = link.builder._links ?? [];
			for (const nestedLink of ebLinks) lines.push(...this._renderLinkEntity(nestedLink, childIndent));
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
			const ctx = {
				table: this._table,
				client: this._table.client,
				recordId
			};
			for (const [alias, info] of aliasInfo) if (info.name in v) result[alias] = info.field ? info.field.transformFromDataverse(v[info.name], ctx) : v[info.name];
			else result[alias] = info.getDefault();
			result[ETAG] = v["@odata.etag"];
			return result;
		}
		return this._table.transformValueFromDataverse(v);
	}
	async execute(options) {
		this._applyExecuteOptions(options);
		const results = [];
		for await (const page of this.iteratePages(options)) results.push(...page);
		return results;
	}
	async *iterate(options) {
		this._applyExecuteOptions(options);
		for await (const page of this.iteratePages(options)) yield* page;
	}
	async *iteratePages(options) {
		this._applyExecuteOptions(options);
		for await (const page of this._table.client.iteratePages(this._table.entitySetName, {
			...options,
			query: this.toString()
		})) yield page.map((v) => this._transformRow(v));
	}
	_buildAliasInfo() {
		const map = /* @__PURE__ */ new Map();
		this._collectAliases(this, map);
		return map;
	}
	_collectAliases(builder, map) {
		for (const attr of builder._getEffectiveAttributes()) {
			const fields = builder._table.fields;
			const entry = Object.entries(fields).find(([_, f]) => (f.fromDataverseName ?? f.logicalName) === attr.name);
			if (entry) {
				const fieldDef = entry[1];
				const dataverseName = fieldDef.fromDataverseName ?? fieldDef.logicalName;
				map.set(attr.alias, {
					field: FieldRef.fromPath(fieldDef, dataverseName),
					getDefault: () => fieldDef.getDefault?.(),
					name: attr.alias
				});
			} else map.set(attr.alias, {
				field: void 0,
				getDefault: () => void 0,
				name: attr.name
			});
		}
		for (const link of builder._links) if (!EntityQueryBuilder._isFilterOnlyLinkType(link.linkType)) this._collectAliases(link.builder, map);
	}
};
function fetchXml(table) {
	return new FetchXmlInitialImpl(table);
}
var FetchXmlInitialImpl = class {
	#builder;
	constructor(table) {
		this.#builder = new EntityQueryBuilder(table);
	}
	select(selector) {
		if (selector) return this.#builder.select(selector);
		return this.#builder.select((f) => {
			const result = {};
			for (const key of Object.keys(f)) result[key] = key;
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
};

//#endregion
//#region src/query/fetchxml/ast.ts
function escapeXml(value) {
	return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}
function serializeAttribute(attribute) {
	return `<attribute ${[
		`name="${escapeXml(attribute.name)}"`,
		attribute.alias === void 0 ? void 0 : `alias="${escapeXml(attribute.alias)}"`,
		attribute.aggregate === void 0 ? void 0 : `aggregate="${escapeXml(attribute.aggregate)}"`,
		attribute.groupby ? `groupby="true"` : void 0,
		attribute.dategrouping === void 0 ? void 0 : `dategrouping="${escapeXml(attribute.dategrouping)}"`,
		attribute.distinct ? `distinct="true"` : void 0,
		attribute.rowaggregate === void 0 ? void 0 : `rowaggregate="${escapeXml(attribute.rowaggregate)}"`
	].filter((value) => value !== void 0).join(" ")}/>`;
}
function serializeOrder(order) {
	return `<order ${[
		`attribute="${escapeXml(order.attribute)}"`,
		order.entityname === void 0 ? void 0 : `entityname="${escapeXml(order.entityname)}"`,
		order.descending ? `descending="true"` : void 0
	].filter((value) => value !== void 0).join(" ")}/>`;
}
function serializeLink(link) {
	return `<link-entity ${[
		`name="${escapeXml(link.name)}"`,
		link.from === void 0 ? void 0 : `from="${escapeXml(link.from)}"`,
		link.to === void 0 ? void 0 : `to="${escapeXml(link.to)}"`,
		`link-type="${escapeXml(link.linkType)}"`,
		link.alias === void 0 ? void 0 : `alias="${escapeXml(link.alias)}"`,
		link.intersect ? `intersect="true"` : void 0
	].filter((value) => value !== void 0).join(" ")}>${serializeContents(link)}</link-entity>`;
}
function serializeContents(ast) {
	return `${ast.attributes.map(serializeAttribute).join("")}${ast.filters.map((filter) => typeof filter === "string" ? filter : renderFilterFetchXml(filter)).join("")}${ast.orders.map(serializeOrder).join("")}${ast.links.map(serializeLink).join("")}`;
}
function serializeFetchXml(ast) {
	const values = [
		`name="${escapeXml(ast.entity)}"`,
		ast.version === void 0 ? void 0 : `version="${escapeXml(ast.version)}"`,
		ast.mapping === void 0 ? void 0 : `mapping="${escapeXml(ast.mapping)}"`,
		ast.distinct ? `distinct="true"` : void 0,
		ast.top === void 0 ? void 0 : `top="${ast.top}"`,
		ast.datasource === void 0 ? void 0 : `datasource="${escapeXml(ast.datasource)}"`,
		ast.options === void 0 ? void 0 : `options="${escapeXml(ast.options)}"`,
		ast.lateMaterialize ? `latematerialize="true"` : void 0,
		ast.aggregateLimit === void 0 ? void 0 : `aggregatelimit="${ast.aggregateLimit}"`,
		ast.useRawOrderBy ? `useraworderby="true"` : void 0
	].filter((value) => value !== void 0);
	return `<fetch${ast.kind === "xml-aggregate" ? ` aggregate="true"` : ""}><entity ${values.join(" ")}>${serializeContents(ast)}</entity></fetch>`;
}

//#endregion
export { Above, AboveOrEqual, Aggregation, Between, BooleanField, ChoiceField, CollectionIdsProperty, CollectionProperty, ContainsValues, DataverseClient, DataverseHttpError, DataverseIntersectTable, DataverseTable, DateField, DateTimeField, DoesNotContainValues, ETAG, EntityQueryBuilder, EqualBusinessId, EqualUserId, EqualUserLanguage, EqualUserOrUserHierarchy, EqualUserOrUserHierarchyAndTeams, EqualUserOrUserTeams, FetchXmlAggregateQuery, FieldBase, FieldRef, FileField, FilterCollector, FilterExpr, FormattedField, GroupByExpr, ImageField, In, InFiscalPeriod, InFiscalPeriodAndYear, InFiscalYear, InOrAfterFiscalPeriodAndYear, InOrBeforeFiscalPeriodAndYear, JsonField, Last7Days, LastFiscalPeriod, LastFiscalYear, LastMonth, LastWeek, LastXDays, LastXFiscalPeriods, LastXFiscalYears, LastXHours, LastXMonths, LastXWeeks, LastXYears, LastYear, ListField, LookupIdProperty, LookupProperty, MultiChoiceField, Next7Days, NextFiscalPeriod, NextFiscalYear, NextMonth, NextWeek, NextXDays, NextXFiscalPeriods, NextXFiscalYears, NextXHours, NextXMonths, NextXWeeks, NextXYears, NextYear, NotBetween, NotEqualBusinessId, NotEqualUserId, NotIn, NotUnder, NullableBooleanField, NullableChoiceField, NullableDateField, NullableDateTimeField, NullableNumberField, NullableStringField, NumberField, ODataApplyQuery, OlderThanXDays, OlderThanXHours, OlderThanXMinutes, OlderThanXMonths, OlderThanXWeeks, OlderThanXYears, On, OnOrAfter, OnOrBefore, OrderSpec, PrimaryKeyField, RetrieveAadUserRoles, RetrieveChoices, RetrieveTotalRecordCount, SKIP, StringField, ThisFiscalPeriod, ThisFiscalYear, ThisMonth, ThisWeek, ThisYear, Today, Tomorrow, Under, UnderOrEqual, WhoAmI, Yesterday, all, and, any, asc, attachETag, average, base64ImageToURL, boolean, buildLambdaProxy, buildTableQueryAst, choice, collection, collectionIds, contains, count, date, datetime, desc, endsWith, eq, expand, fetchOdata, fetchXml, file, formatted, ge, getEtag, getImageUrl, getName, groupby, gt, image, isActive, isInactive, isNonEmptyString, isNotNull, isNull, json, keys, le, list, lookup, lookupId, lt, mapChoices, max, mergeRecords, min, multiChoice, ne, not, nullableBoolean, nullableChoice, nullableDate, nullableDateTime, nullableNumber, nullableString, number, or, orderby, parseDateOnly, primaryKey, select, serializeFetchXml, serializeODataAggregate, serializeODataSelect, startsWith, string, sum, toBase64, toDateOnly, toODataFilterNode, toODataPath, wrapString, xml };