import { GUID, DataverseTable } from "../../../src"

export class FixtureTracker {
  readonly sessionPrefix = `dvt${Date.now().toString(36)}`
  private runIndex = 0
  readonly ids: GUID[] = []

  beginRun(): void {
    this.runIndex++
    this.ids.length = 0
  }

  get runPrefix(): string {
    return `${this.sessionPrefix}-r${this.runIndex}`
  }

  track(id: GUID | undefined | null): GUID {
    if (!id) throw new Error("track() called without an id")
    this.ids.push(id)
    return id
  }

  name(kind: string): string {
    return `${this.runPrefix}-${kind}`
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
