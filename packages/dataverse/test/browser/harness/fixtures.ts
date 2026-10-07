import { GUID, DataverseTable } from "../../../src"

export class FixtureTracker {
  readonly sessionPrefix = `dvt${Date.now().toString(36)}`
  private runIndex = 0
  private tag = ""
  private counters: Record<string, number> = {}
  readonly ids: GUID[] = []

  beginRun(): void {
    this.runIndex++
    this.ids.length = 0
  }

  beginSuite(tag: string): void {
    this.tag = tag
    this.counters = {}
  }

  /** Prefix that uniquely identifies the CURRENT suite's data (used by scoped filters). */
  get scopePrefix(): string {
    return `${this.sessionPrefix}-r${this.runIndex}-${this.tag}`
  }

  track(id: GUID | undefined | null): GUID {
    if (!id) throw new Error("track() called without an id")
    this.ids.push(id)
    return id
  }

  name(kind: string): string {
    const n = (this.counters[kind] ?? 0) + 1
    this.counters[kind] = n
    return `${this.scopePrefix}-${kind}-${n}`
  }
}

export function pngBlob(): Blob {
  const b64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=="
  const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))
  return new Blob([bytes], { type: "image/png" })
}

export async function deleteByIds(table: DataverseTable<any>, ids: GUID[]): Promise<number> {
  let deleted = 0
  for (const id of ids) {
    try {
      await table.deleteRecord(id)
      deleted++
    } catch {
      // best-effort cleanup
    }
  }
  return deleted
}

/**
 * Deletes leftovers from previous runs whose generated name starts with the
 * shared "dvt" stem. Returns the number deleted, or -1 if the sweep query failed.
 */
export async function sweepOrphans(table: DataverseTable<any>): Promise<number> {
  try {
    const rows = await table.getRecords({ filter: "startswith(nnsyc200_name,'dvt')" })
    const ids = rows.map((r) => r.id).filter((id): id is GUID => !!id)
    return await deleteByIds(table, ids)
  } catch {
    return -1
  }
}
