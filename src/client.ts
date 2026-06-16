import { DataverseKey, GUID } from "./types";
import { getName, Name } from "./util";
import { wrapString } from "./query";

const parenthesesRegEx = /\(([^)]+)\)/;

export type DataverseClientOptions = {
    url?: string;
    token?: string;
    impersonateByAAId?: string;
    impersonateByUserId?: string;
    headers?: Record<string, string>;
};

export class DataverseClient {
    options: DataverseClientOptions;

    constructor(options: DataverseClientOptions = {}) {
        this.options = {
            url: location.origin,
            ...options,
        };
    }

    /**
     * The core fetch method for all Dataverse API calls.
     */
    async fetch(resource: string, options: RequestInit = {}): Promise<any> {
        if (this._processChangeset(resource, options)) return;
        if (this._processBatch(resource, options)) return;
        // Handle full URLs from @odata.nextLink
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
                ...(impersonateByUserId ? { MSCRMCallerID: impersonateByUserId } : {}),
                ...(impersonateByAAId ? { CallerObjectId: impersonateByAAId } : {}),
                ...(token ? { Authorization: `Bearer ${token}` } : {}),
                ...headers,
                ...options.headers,
            },
        });

        if (response.status === 204) {
            // No Content
            const entityId = response.headers.get("OData-EntityId");
            if (entityId) return parenthesesRegEx.exec(entityId)?.[1];
            return;
        }

        if (response.status === 304) {
            // Not Modified (conditional GET)
            return null;
        }

        if (response.headers.get("Content-Type")?.includes("application/json")) {
            const data = await response.json();
            if (data.error) {
                if (data.error.code === "0x80060891") return null; // Record not Found
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

    private async _getNextLink(result: any): Promise<any[]> {
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

    async getRecord(entitySetName: Name, id: DataverseKey, query: string = "", etag?: string) {
        const resource = `${getName(entitySetName)}(${id})?${query}`;
        if (etag) {
            return this.fetch(resource, { headers: { "If-None-Match": etag } as Record<string, string> });
        }
        return this.fetch(resource);
    }

    async getRecords(entitySetName: Name, query: string = ""): Promise<any[]> {
        const resource = `${entitySetName}?${query}`;
        return this.fetch(resource).then((r) => this._getNextLink(r));
    }

    async postRecord(entitySetName: Name, value: object, query: string = "") {
        return this.fetch(`${getName(entitySetName)}?${query}`, {
            method: "POST",
            headers: { Prefer: "return=representation" },
            body: JSON.stringify(value),
        });
    }

    async postRecordGetId(entitySetName: Name, value: object): Promise<GUID> {
        return this.fetch(getName(entitySetName), {
            method: "POST",
            body: JSON.stringify(value),
        });
    }

    async patchRecord(entitySetName: Name, id: string, value: object, query: string = "", etag?: string) {
        const extraHeaders: Record<string, string> = { Prefer: "return=representation" };
        if (etag) extraHeaders["If-Match"] = etag;
        return this.fetch(`${getName(entitySetName)}(${id})?${query}`, {
            method: "PATCH",
            headers: extraHeaders,
            body: JSON.stringify(value),
        });
    }

    async deleteRecord(entitySetName: Name, id: string, etag?: string): Promise<GUID> {
        const options: RequestInit = { method: "DELETE" };
        if (etag) options.headers = { "If-Match": etag } as Record<string, string>;
        await this.fetch(`${getName(entitySetName)}(${id})`, options);
        return id as GUID;
    }

    async updatePropertyValue(entitySetName: Name, id: string, propertyName: Name, value: any, etag?: string): Promise<GUID> {
        const options: RequestInit = {
            method: "PUT",
            body: JSON.stringify({ value }),
        };
        if (etag) options.headers = { "If-Match": etag } as Record<string, string>;
        await this.fetch(`${getName(entitySetName)}(${id})/${getName(propertyName)}`, options);
        return id as GUID;
    }

    async deletePropertyValue(entitySetName: Name, id: string, propertyName: Name): Promise<GUID> {
        await this.fetch(`${getName(entitySetName)}(${id})/${getName(propertyName)}`, {
            method: "DELETE",
        });
        return id as GUID;
    }

    async getPropertyValue(entitySetName: Name, id: string, propertyName: Name): Promise<any> {
        return this.fetch(`${getName(entitySetName)}(${id})/${getName(propertyName)}`).then((r) => r.value);
    }

    async getPropertyRawValue(entitySetName: Name, id: string, propertyName: Name): Promise<any> {
        return this.fetch(`${getName(entitySetName)}(${id})/${getName(propertyName)}/$value`);
    }

    getPropertyRawValueURL(entitySetName: Name, id: string, propertyName: Name): string {
        return `${this.options.url}/api/data/v9.2/${getName(entitySetName)}(${id})/${getName(propertyName)}/$value`;
    }

    getImageFullSizeURL(entitySetName: Name, id: string, propertyName: Name): string {
        return `${this.options.url}/api/data/v9.2/${getName(entitySetName)}(${id})/${getName(propertyName)}/$value?size=full`;
    }

    getImageDownloadURL(entitySetName: Name, id: string, propertyName: Name): string {
        return `${this.options.url}/Image/download.aspx?Entity=${getName(entitySetName)}&Attribute=${getName(propertyName)}&Id=${id}&Full=true`;
    }

    async updateFileProperty(entitySetName: Name, id: string, propertyName: Name, filename: string, body: string | Blob | BufferSource) {
        return this.fetch(`${getName(entitySetName)}(${id})/${getName(propertyName)}`, {
            method: "PATCH",
            headers: {
                "Content-Type": "application/octet-stream",
                "x-ms-file-name": filename,
            },
            body,
        });
    }

    async activateRecord(entitySetName: Name, id: string): Promise<GUID> {
        return this.updatePropertyValue(entitySetName, id, "statecode", 0);
    }

    async deactivateRecord(entitySetName: Name, id: string): Promise<GUID> {
        return this.updatePropertyValue(entitySetName, id, "statecode", 1);
    }

    async associateRecord(
        entitySetName: Name,
        parentId: string,
        propertyName: Name,
        childEntitySetName: Name,
        childId: string,
    ): Promise<GUID> {
        await this.fetch(`${getName(entitySetName)}(${parentId})/${getName(propertyName)}/$ref`, {
            method: "PUT",
            body: JSON.stringify({
                "@odata.id": `${this.options.url}/api/data/v9.2/${getName(childEntitySetName)}(${childId})`,
            }),
        });
        return childId as GUID;
    }

    async dissociateRecord(entitySetName: Name, parentId: string, propertyName: Name, childId?: string): Promise<GUID> {
        const resource = `${getName(entitySetName)}(${parentId})/${getName(propertyName)}${childId ? `(${childId})` : ""}/$ref`;
        await this.fetch(resource, { method: "DELETE" });
        return (childId ?? parentId) as GUID;
    }

    async getAssociatedRecords(
        entitySetName: Name,
        id: string,
        navigationPropertyName: Name,
        query: string = "",
    ): Promise<any[]> {
        const resource = `${getName(entitySetName)}(${id})/${getName(navigationPropertyName)}?${query}`;
        return this.fetch(resource).then((r) => r.value);
    }

    async getAssociatedRecord(entitySetName: Name, id: string, navigationPropertyName: Name, query: string = "") {
        const resource = `${getName(entitySetName)}(${id})/${getName(navigationPropertyName)}?${query}`;
        return this.fetch(resource);
    }

    async associateRecordToList(
        entitySetName: Name,
        parentId: string,
        propertyName: Name,
        childEntitySetName: Name,
        childPrimaryKeyName: Name,
        childIds: string[],
    ): Promise<GUID[]> {
        const currentAssociated = await this.getAssociatedRecords(
            entitySetName,
            parentId,
            propertyName,
            `$select=${getName(childPrimaryKeyName)}`,
        );
        const currentIds = currentAssociated.map((r) => r[getName(childPrimaryKeyName)]);

        const promises: Promise<any>[] = [];

        // Associate new records
        for (const id of childIds) {
            if (!currentIds.includes(id)) {
                promises.push(this.associateRecord(entitySetName, parentId, propertyName, childEntitySetName, id));
            }
        }

        // Dissociate old records
        for (const id of currentIds) {
            if (!childIds.includes(id)) {
                promises.push(this.dissociateRecord(entitySetName, parentId, propertyName, id));
            }
        }

        await Promise.all(promises);
        return childIds as GUID[];
    }

    //
    // --- ACTIONS (POST - have side effects) ---
    //

    /**
     * Executes an unbound Dataverse action.
     * POST /{ActionName}
     */
    async executeAction(actionName: string, params?: Record<string, any>): Promise<any> {
        return this.fetch(actionName, {
            method: "POST",
            body: params ? JSON.stringify(params) : undefined,
        });
    }

    /**
     * Executes a bound Dataverse action on a specific record or entity set.
     * POST /{entitySet}({id})/Microsoft.Dynamics.CRM.{ActionName}  (bound to record)
     * POST /{entitySet}/Microsoft.Dynamics.CRM.{ActionName}        (bound to entity set)
     */
    async executeBoundAction(
        entitySetName: Name,
        actionName: string,
        params?: Record<string, any>,
        id?: string,
    ): Promise<any> {
        const path = id
            ? `${getName(entitySetName)}(${id})/Microsoft.Dynamics.CRM.${actionName}`
            : `${getName(entitySetName)}/Microsoft.Dynamics.CRM.${actionName}`;
        return this.fetch(path, {
            method: "POST",
            body: params ? JSON.stringify(params) : undefined,
        });
    }

    //
    // --- FUNCTIONS (GET - no side effects) ---
    //

    /**
     * Executes an unbound Dataverse function.
     * GET /{FunctionName}(Param1=value1,Param2='string')
     */
    async executeFunction(functionName: string, params?: Record<string, any>): Promise<any> {
        const paramString = params
            ? `(${Object.entries(params).map(([k, v]) => `${k}=${wrapString(v)}`).join(",")})`
            : "()";
        return this.fetch(`${functionName}${paramString}`);
    }

    /**
     * Executes a bound Dataverse function on a specific record.
     * GET /{entitySet}({id})/Microsoft.Dynamics.CRM.{FunctionName}(Param1=value1)
     */
    async executeBoundFunction(
        entitySetName: Name,
        id: string,
        functionName: string,
        params?: Record<string, any>,
    ): Promise<any> {
        const paramString = params
            ? `(${Object.entries(params).map(([k, v]) => `${k}=${wrapString(v)}`).join(",")})`
            : "()";
        return this.fetch(
            `${getName(entitySetName)}(${id})/Microsoft.Dynamics.CRM.${functionName}${paramString}`
        );
    }

    //
    // --- BULK OPERATIONS ---
    //

    /**
     * Creates multiple records in a single API call.
     * POST /{entitySet}/Microsoft.Dynamics.CRM.CreateMultiple
     */
    async createMultiple(entitySetName: Name, records: Record<string, any>[]): Promise<any> {
        return this.fetch(
            `${getName(entitySetName)}/Microsoft.Dynamics.CRM.CreateMultiple`,
            { method: "POST", body: JSON.stringify({ Targets: records }) },
        );
    }

    /**
     * Updates multiple records in a single API call.
     * POST /{entitySet}/Microsoft.Dynamics.CRM.UpdateMultiple
     */
    async updateMultiple(entitySetName: Name, records: Record<string, any>[]): Promise<any> {
        return this.fetch(
            `${getName(entitySetName)}/Microsoft.Dynamics.CRM.UpdateMultiple`,
            { method: "POST", body: JSON.stringify({ Targets: records }) },
        );
    }

    /**
     * Deletes multiple records in a single API call by their IDs.
     * POST /{entitySet}/Microsoft.Dynamics.CRM.DeleteMultiple
     */
    async deleteMultiple(entitySetName: Name, ids: string[]): Promise<any> {
        const targets = ids.map(id => ({
            "@odata.id": `${this.options.url}/api/data/v9.2/${getName(entitySetName)}(${id})`,
        }));
        return this.fetch(
            `${getName(entitySetName)}/Microsoft.Dynamics.CRM.DeleteMultiple`,
            { method: "POST", body: JSON.stringify({ Targets: targets }) },
        );
    }

    _batchTxs: NestedStringArray | null = null;

    async batch(fn: () => Promise<void>) {
        if (this._batchTxs) throw new Error("Cannot nest batches")
        let tx: NestedStringArray | null = [];
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
                "Content-Type": `multipart/mixed; boundary="batch_${batchId}"`,
            },
            body,
        });

        return result
    }

    _processBatch(resource: string, options: RequestInit): boolean {
        if (!this._batchTxs) return false;

        this._batchTxs.push([
            `${options.method} /api/data/v9.2/${resource} HTTP/1.1`,
            `Content-Type: ${(options.headers as Record<string, string>)?.["Content-Type"]}`,
            "",
            options.body?.toString() ?? "",
        ]);

        return true;
    }

    _changeSetTxs: NestedStringArray | null = null;

    async changeset(fn: () => Promise<void>): Promise<void> {
        if (this._changeSetTxs) throw new Error("Cannot nest changesets")
        if (!this._batchTxs) return this.batch(()=>this.changeset(fn))
        this._changeSetTxs = [];
        try {
            await fn();
        } finally {
            const id = crypto.randomUUID();
            this._batchTxs!.push([
                `Content-Type: multipart/mixed; boundary="changeset_${id}"`,
                "",
                this._changeSetTxs.map((v, i) => [
                    `--changeset_${id}`,
                    `Content-Type: application/http`,
                    `Content-Transfer-Encoding: binary`,
                    `Content-ID: ${i + 1}`,
                    "",
                    v,
                ]),
                `--changeset_${id}--`,
            ]);
            this._changeSetTxs = null;
        }
    }

    _processChangeset(resource: string, options: RequestInit): boolean {
        if (!this._batchTxs) return false;
        if (!this._changeSetTxs) return false;

        // console.log("processChangeset", resource, options)

        this._changeSetTxs.push([
            `${options.method} /api/data/v9.2/${resource} HTTP/1.1`,
            `Content-Type: application/json; type=entry`,
            "",
            options.body?.toString() ?? "",
        ]);

        return true;
    }
}

type NestedStringArray = Array<string | NestedStringArray>;
