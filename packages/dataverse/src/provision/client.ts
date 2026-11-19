import { DataverseClient, DataverseHttpError } from "../client";
import { throwIfAborted } from "./abort";
import type {
  CreatedEntityMetadata,
  ExistingAttributeMetadata,
  ExistingEntityMetadata,
  ProvisionMetadataReader,
  ProvisionMetadataWriter,
  ProvisionOptions,
} from "./types";

/*
 * Web API adapter for the provisioner.
 *
 * Reads are used by the planner; writes are only ever POSTs (plus one PATCH
 * that promotes a freshly created primary image). There is no update or
 * delete path for existing components on purpose: additive-only provisioning
 * never alters them.
 *
 * Resilience: every request runs under a timeout and honors the caller's
 * AbortSignal. Reads retry 429/5xx/network failures; writes are never retried
 * because a timed-out POST may already have been applied by the server.
 * Publishing gets a longer timeout and is also single-shot.
 */

const DEFAULT_TIMEOUT_MS = 60_000;
const DEFAULT_PUBLISH_TIMEOUT_MS = 180_000;
const DEFAULT_READ_RETRIES = 3;
const RETRY_BASE_DELAY_MS = 300;

function escapeODataString(value: string): string {
  return value.replaceAll("'", "''");
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function retryAfterMs(error: unknown): number | undefined {
  if (!(error instanceof DataverseHttpError)) {
    return undefined;
  }

  const header = error.response?.headers.get("Retry-After");

  if (header == null) {
    return undefined;
  }

  const seconds = Number(header);

  if (!Number.isNaN(seconds)) {
    return Math.max(0, seconds * 1000);
  }

  const date = new Date(header).getTime();

  return Number.isNaN(date) ? undefined : Math.max(0, date - Date.now());
}

function isRetryableRead(error: unknown): boolean {
  if (error instanceof DataverseHttpError) {
    return error.status === 429 || error.status >= 500;
  }

  // Network failures and our own timeout abort are worth another attempt for
  // an idempotent GET.
  return error instanceof TypeError || (error as { name?: string } | null)?.name === "AbortError";
}

function combineSignals(signals: (AbortSignal | undefined)[]): AbortSignal | undefined {
  const active = signals.filter((signal): signal is AbortSignal => signal != null);

  if (active.length === 0) {
    return undefined;
  }

  if (active.length === 1) {
    return active[0];
  }

  const anySignal = (AbortSignal as unknown as {
    any?: (signals: AbortSignal[]) => AbortSignal;
  }).any;

  if (typeof anySignal === "function") {
    return anySignal(active);
  }

  const controller = new AbortController();

  for (const signal of active) {
    if (signal.aborted) {
      controller.abort(signal.reason);
      break;
    }

    signal.addEventListener("abort", () => controller.abort(signal.reason), { once: true });
  }

  return controller.signal;
}

type AttributeResponse = {
  LogicalName?: string;
  AttributeType?: string;
  AttributeTypeName?: { Value?: string };
};

type EntityResponse = {
  LogicalName?: string;
  EntitySetName?: string;
  PrimaryIdAttribute?: string;
  PrimaryNameAttribute?: string;
  PrimaryImageAttribute?: string;
  Attributes?: AttributeResponse[];
};

/** Live metadata client over a {@link DataverseClient}. */
export class DataverseProvisionClient implements ProvisionMetadataReader, ProvisionMetadataWriter {
  readonly client: DataverseClient;
  readonly #solution?: string;
  readonly #signal?: AbortSignal;
  readonly #timeoutMs: number;
  readonly #publishTimeoutMs: number;
  readonly #readRetries: number;

  constructor(client: DataverseClient, options: ProvisionOptions = {}) {
    this.client = client;
    this.#solution = options.solution?.trim() || undefined;
    this.#signal = options.signal;
    this.#timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.#publishTimeoutMs = options.publishTimeoutMs ?? DEFAULT_PUBLISH_TIMEOUT_MS;
    this.#readRetries = options.readRetries ?? DEFAULT_READ_RETRIES;
  }

  get #headers(): Record<string, string> | undefined {
    return this.#solution == null ? undefined : { "MSCRM.SolutionUniqueName": this.#solution };
  }

  /** Table metadata plus its attributes, or `undefined` when the table does not exist. */
  async getEntity(logicalName: string): Promise<ExistingEntityMetadata | undefined> {
    throwIfAborted(this.#signal);

    let response: EntityResponse;

    try {
      response = await this.#readEntity(logicalName, true);
    } catch (error) {
      /*
       * AttributeTypeName is a complex property. If this org/version rejects it
       * inside $expand, retry with the primitive AttributeType only.
       */
      if (error instanceof DataverseHttpError && error.status === 400) {
        response = await this.#readEntity(logicalName, false);
      } else if (error instanceof DataverseHttpError && error.status === 404) {
        return undefined;
      } else {
        throw error;
      }
    }

    const attributes = new Map<string, ExistingAttributeMetadata>();

    for (const attribute of response.Attributes ?? []) {
      if (typeof attribute.LogicalName !== "string") {
        continue;
      }

      attributes.set(attribute.LogicalName.toLowerCase(), {
        logicalName: attribute.LogicalName,
        attributeTypeName: attribute.AttributeTypeName?.Value,
        attributeType: attribute.AttributeType,
      });
    }

    return {
      logicalName,
      entitySetName: response.EntitySetName,
      primaryIdAttribute: response.PrimaryIdAttribute,
      primaryNameAttribute: response.PrimaryNameAttribute,
      primaryImageAttribute: response.PrimaryImageAttribute,
      attributes,
    };
  }

  /** Idempotent metadata read: retries 429/5xx/network failures. */
  async #readEntity(logicalName: string, includeTypeName: boolean): Promise<EntityResponse> {
    const attributeSelect = includeTypeName
      ? "LogicalName,AttributeType,AttributeTypeName"
      : "LogicalName,AttributeType";
    const resource =
      `EntityDefinitions(LogicalName='${escapeODataString(logicalName)}')` +
      "?$select=LogicalName,EntitySetName,PrimaryIdAttribute,PrimaryNameAttribute,PrimaryImageAttribute" +
      `&$expand=Attributes($select=${attributeSelect})`;

    for (let attempt = 0; ; attempt++) {
      try {
        return (await this.#request(resource, {}, this.#timeoutMs)) as EntityResponse;
      } catch (error) {
        if (this.#signal?.aborted || !isRetryableRead(error) || attempt >= this.#readRetries) {
          throw error;
        }

        await sleep(retryAfterMs(error) ?? RETRY_BASE_DELAY_MS * 2 ** attempt);
      }
    }
  }

  /** One request under the caller's signal plus an internal timeout. */
  async #request(
    resource: string,
    init: RequestInit,
    timeoutMs: number,
  ): Promise<unknown> {
    throwIfAborted(this.#signal);

    const controller = new AbortController();
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, timeoutMs);

    try {
      return await this.client.fetch(resource, {
        ...init,
        signal: combineSignals([this.#signal, controller.signal]),
      });
    } catch (error) {
      if (timedOut) {
        throw new Error(
          `Request timed out after ${Math.round(timeoutMs / 1000)}s (${resource.split("?")[0]}).`,
        );
      }

      throw error;
    } finally {
      clearTimeout(timer);
    }
  }

  async createEntity(
    logicalName: string,
    definition: Record<string, unknown>,
  ): Promise<CreatedEntityMetadata | void> {
    const body = await this.#request(
      "EntityDefinitions",
      {
        method: "POST",
        body: JSON.stringify(definition),
        headers: { Prefer: "return=representation", ...this.#headers },
      },
      this.#timeoutMs,
    );

    const created = body != null && typeof body === "object" ? (body as EntityResponse) : undefined;

    if (created?.EntitySetName != null) {
      return {
        entitySetName: created.EntitySetName,
        primaryIdAttribute: created.PrimaryIdAttribute,
        primaryNameAttribute: created.PrimaryNameAttribute,
      };
    }

    /*
     * Some org versions ignore return=representation for metadata creates.
     * Read the created table back so apply can still validate the derived
     * entity set / primary key. A failed read must not fail the create.
     */
    try {
      const entity = await this.getEntity(logicalName);

      return entity == null
        ? undefined
        : {
            entitySetName: entity.entitySetName,
            primaryIdAttribute: entity.primaryIdAttribute,
            primaryNameAttribute: entity.primaryNameAttribute,
          };
    } catch {
      return undefined;
    }
  }

  async createAttribute(entityLogicalName: string, definition: Record<string, unknown>): Promise<void> {
    await this.#request(
      `EntityDefinitions(LogicalName='${escapeODataString(entityLogicalName)}')/Attributes`,
      {
        method: "POST",
        body: JSON.stringify(definition),
        headers: this.#headers,
      },
      this.#timeoutMs,
    );
  }

  async updateAttribute(
    entityLogicalName: string,
    attributeLogicalName: string,
    definition: Record<string, unknown>,
  ): Promise<void> {
    await this.#request(
      `EntityDefinitions(LogicalName='${escapeODataString(entityLogicalName)}')` +
        `/Attributes(LogicalName='${escapeODataString(attributeLogicalName)}')`,
      {
        method: "PATCH",
        body: JSON.stringify(definition),
        headers: this.#headers,
      },
      this.#timeoutMs,
    );
  }

  async createRelationship(definition: Record<string, unknown>): Promise<void> {
    await this.#request(
      "RelationshipDefinitions",
      {
        method: "POST",
        body: JSON.stringify(definition),
        headers: this.#headers,
      },
      this.#timeoutMs,
    );
  }

  async publishEntities(logicalNames: string[]): Promise<void> {
    const entities = [...new Set(logicalNames.filter((name) => name.length > 0))];

    if (entities.length === 0) {
      return;
    }

    const parameterXml =
      "<importexportxml><entities>" +
      entities.map((name) => `<entity>${name}</entity>`).join("") +
      "</entities></importexportxml>";

    await this.#request(
      "PublishXml",
      {
        method: "POST",
        body: JSON.stringify({ ParameterXml: parameterXml }),
        headers: this.#headers,
      },
      this.#publishTimeoutMs,
    );
  }
}
