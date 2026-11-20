"use client";

import { useCallback, useSyncExternalStore } from "react";
import { useSession } from "@/components/session-provider";
import {
  MAX_COMPARE,
  compareStore,
  type CompareEntry,
} from "@/lib/compare-store";

export function useCompare() {
  const { profile } = useSession();
  const organizationId = profile.activeContext?.organizationId ?? "";

  const items = useSyncExternalStore(
    compareStore.subscribe,
    () => compareStore.snapshot(organizationId),
    compareStore.serverSnapshot,
  );

  const has = useCallback(
    (id: number) => items.some((item) => item.id === id),
    [items],
  );
  const toggle = useCallback(
    (entry: CompareEntry) => {
      if (items.some((item) => item.id === entry.id)) {
        compareStore.remove(organizationId, entry.id);
        return true;
      }
      return compareStore.add(organizationId, entry);
    },
    [items, organizationId],
  );
  const remove = useCallback(
    (id: number) => compareStore.remove(organizationId, id),
    [organizationId],
  );
  const clear = useCallback(
    () => compareStore.clear(organizationId),
    [organizationId],
  );

  return {
    items,
    count: items.length,
    full: items.length >= MAX_COMPARE,
    max: MAX_COMPARE,
    has,
    toggle,
    remove,
    clear,
  };
}
