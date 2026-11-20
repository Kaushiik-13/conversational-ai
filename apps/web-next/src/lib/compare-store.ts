/**
 * The parts a user has picked to compare. Kept in the browser, per
 * organization, so a selection never carries over to another organization.
 * Only ids and labels are stored; the compare page always re-checks access
 * with the server.
 */
export const MAX_COMPARE = 4;

export interface CompareEntry {
  id: number;
  partNumber: string;
  partName: string;
}

const EMPTY: readonly CompareEntry[] = [];
const listeners = new Set<() => void>();
const cache = new Map<string, readonly CompareEntry[]>();

const storageKey = (organizationId: string) =>
  `askalytics:compare:${organizationId}`;

function isEntry(value: unknown): value is CompareEntry {
  const entry = value as Partial<CompareEntry> | null;
  return (
    !!entry &&
    Number.isInteger(entry.id) &&
    typeof entry.partNumber === "string" &&
    typeof entry.partName === "string"
  );
}

function read(organizationId: string): readonly CompareEntry[] {
  if (!organizationId) return EMPTY;
  const cached = cache.get(organizationId);
  if (cached) return cached;
  let entries: CompareEntry[] = [];
  try {
    const raw = window.localStorage.getItem(storageKey(organizationId));
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    if (Array.isArray(parsed)) {
      entries = parsed.filter(isEntry).slice(0, MAX_COMPARE);
    }
  } catch {
    // Storage can be blocked or corrupt; start empty.
  }
  cache.set(organizationId, entries);
  return entries;
}

function write(organizationId: string, entries: readonly CompareEntry[]) {
  cache.set(organizationId, entries);
  try {
    window.localStorage.setItem(
      storageKey(organizationId),
      JSON.stringify(entries),
    );
  } catch {
    // Selection still works for this tab even if it cannot be saved.
  }
  listeners.forEach((listener) => listener());
}

export const compareStore = {
  subscribe(listener: () => void) {
    listeners.add(listener);
    const onStorage = () => {
      cache.clear();
      listener();
    };
    window.addEventListener("storage", onStorage);
    return () => {
      listeners.delete(listener);
      window.removeEventListener("storage", onStorage);
    };
  },
  snapshot: read,
  serverSnapshot: () => EMPTY,
  add(organizationId: string, entry: CompareEntry): boolean {
    const current = read(organizationId);
    if (current.some((item) => item.id === entry.id)) return true;
    if (current.length >= MAX_COMPARE) return false;
    write(organizationId, [...current, entry]);
    return true;
  },
  remove(organizationId: string, id: number) {
    write(
      organizationId,
      read(organizationId).filter((item) => item.id !== id),
    );
  },
  clear(organizationId: string) {
    write(organizationId, EMPTY);
  },
};
