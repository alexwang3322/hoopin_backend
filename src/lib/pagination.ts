/**
 * Opaque cursor = base64("<sortValue>|<id>"). Sort key + id (for stable
 * tie-breaking) round-trips through the cursor so pagination stays correct
 * even when rows share a sort value (e.g. same `created_at` second).
 * API_CONTRACT.md §6: cursor pagination on every list endpoint, "an
 * intentional addition beyond the mockup's demo scope."
 */
export function encodeCursor(sortValue: string, id: string): string {
  return btoa(`${sortValue}|${id}`);
}

export function decodeCursor(cursor: string): { sortValue: string; id: string } | null {
  try {
    const decoded = atob(cursor);
    const sep = decoded.lastIndexOf("|");
    if (sep === -1) return null;
    return { sortValue: decoded.slice(0, sep), id: decoded.slice(sep + 1) };
  } catch {
    return null;
  }
}

export const DEFAULT_LIMIT = 20;
export const MAX_LIMIT = 50;

export function parseLimit(raw: string | undefined): number {
  const n = raw ? parseInt(raw, 10) : DEFAULT_LIMIT;
  if (!Number.isFinite(n) || n <= 0) return DEFAULT_LIMIT;
  return Math.min(n, MAX_LIMIT);
}
