import type { Row } from "../db/types";
import type { MergeStrategy } from "./registry";

function rowHash(r: Row): string {
  // deterministic tie-breaker: stable string of a few fields
  return `${r.id}:${r.updatedAt}:${(r as { deletedAt?: number }).deletedAt ?? 0}`;
}

/**
 * Last-write-wins merge for one row pair. Tombstones (deletedAt) win if newer.
 * Returns the row that should survive.
 */
export function mergeRowLww<T extends Row>(local: T, incoming: T): T {
  const localDel = local.deletedAt ?? 0;
  const incDel = incoming.deletedAt ?? 0;
  // Newest tombstone wins outright.
  const localEffective = Math.max(local.updatedAt, localDel);
  const incEffective = Math.max(incoming.updatedAt, incDel);
  if (incEffective > localEffective) return incoming;
  if (incEffective < localEffective) return local;
  // tie-break: higher rev, then lexicographic hash
  const localRev = local.rev ?? 0;
  const incRev = incoming.rev ?? 0;
  if (incRev > localRev) return incoming;
  if (incRev < localRev) return local;
  return rowHash(incoming) > rowHash(local) ? incoming : local;
}

export type MergeTableResult<T extends Row> = {
  rows: T[]; // merged table content
  added: number;
  updated: number;
  unchanged: number;
};

/**
 * Merge an incoming table dump into existing rows.
 * - append tables: union by id
 * - lww tables: per-id last-write-wins
 * Deterministic and idempotent: merging the same dump twice is a no-op.
 */
export function mergeTable<T extends Row>(
  localRows: T[],
  incomingRows: T[],
  strategy: MergeStrategy,
): MergeTableResult<T> {
  const byId = new Map<string, T>(localRows.map((r) => [r.id, r]));
  let added = 0;
  let updated = 0;
  let unchanged = 0;
  for (const inc of incomingRows) {
    const local = byId.get(inc.id);
    if (!local) {
      byId.set(inc.id, inc);
      added++;
      continue;
    }
    if (strategy === "append") {
      unchanged++;
      continue;
    }
    const merged = mergeRowLww(local, inc);
    if (merged === inc && (inc.updatedAt !== local.updatedAt || inc.deletedAt !== local.deletedAt || inc.rev !== local.rev)) {
      byId.set(inc.id, merged);
      updated++;
    } else {
      unchanged++;
    }
  }
  return { rows: [...byId.values()], added, updated, unchanged };
}
