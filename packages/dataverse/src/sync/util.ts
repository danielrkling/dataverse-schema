/**
 * Deep-copies a value into plain objects/arrays. Used to strip the reactive
 * proxies that @tanstack/db's live-query/materialize layer wraps rows in —
 * proxies cannot pass through structuredClone, so any mutation payload that
 * came from a joined row would otherwise throw when written to IndexedDB
 * (or posted over the BroadcastChannel). Reading through the proxy and
 * rebuilding plain containers is enough; no proxy detection is needed.
 */
export function plainClone<T>(value: T): T {
    if (Array.isArray(value)) {
        return value.map(plainClone) as unknown as T;
    }
    // Dates clone naturally via structuredClone once the surrounding proxies
    // are gone, so preserve the instance instead of degrading it to a string.
    if (value instanceof Date) {
        return new Date(value.getTime()) as unknown as T;
    }
    // Binary values (file/image upload payloads: `{ data: Blob }`) must pass
    // through untouched — Object.keys on a Blob yields [], so the generic
    // object branch below would silently replace it with `{}` and the
    // `instanceof Blob` upload path in field afterSave hooks would never fire.
    // These types have no enumerable own properties and cannot be the reactive
    // row proxies being stripped here, so identity-passthrough is safe.
    if (
        value instanceof Blob ||
        value instanceof ArrayBuffer ||
        ArrayBuffer.isView(value)
    ) {
        return value;
    }
    if (value !== null && typeof value === "object") {
        const out: Record<string, unknown> = {};
        for (const key of Object.keys(value as Record<string, unknown>)) {
            out[key] = plainClone((value as Record<string, unknown>)[key]);
        }
        return out as unknown as T;
    }
    return value;
}

/**
 * True for the synthetic bookkeeping properties @tanstack/db (and this
 * library's adapters) attach to rows beside the real Dataverse columns —
 * `$key`, `$collectionId`, `$synced`, `$origin`, … — plus `$etag`. They
 * exist only in the optimistic/in-memory row, never on a server snapshot,
 * so they would always pollute a field-level conflict diff with phantom
 * "differences".
 */
export function isMetaKey(key: string): boolean {
    return key.startsWith("$");
}

/**
 * True when a delta object contains only bookkeeping keys (`$`-prefixed) —
 * i.e., patching it would write nothing to Dataverse. An empty delta
 * (length 0) is left alone: there is nothing to fall back on and the
 * caller's body building will produce an empty (no-op) request either way.
 */
export function isMetaOnly(delta: unknown): boolean {
    const keys = Object.keys(delta ?? {});
    return keys.length > 0 && keys.every(isMetaKey);
}

/**
 * Structural equality for comparing a local mutation field value against the
 * server record in conflict inspection. Handles the value shapes Dataverse
 * records carry: primitives, Date instances (compare by timestamp — JSON
 * round-trips make instance identity useless), arrays, nested plain objects,
 * and binary values (Blob identity).
 */
export function valuesEqual(a: unknown, b: unknown): boolean {
    if (a === b) return true;
    if (a instanceof Date && b instanceof Date) return a.getTime() === b.getTime();
    if (Array.isArray(a) || Array.isArray(b)) {
        if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
        return a.every((v, i) => valuesEqual(v, b[i]));
    }
    if (a && b && typeof a === "object" && typeof b === "object") {
        const ak = Object.keys(a as object), bk = Object.keys(b as object);
        if (ak.length !== bk.length) return false;
        return ak.every((k) => valuesEqual((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k]));
    }
    return false;
}
