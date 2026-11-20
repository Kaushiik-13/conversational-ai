"use client";

import { useEffect, useMemo, useState } from "react";
import { useSession } from "@/components/session-provider";
import { apiRequest } from "@/lib/api";
import type { CategoryNode } from "@/lib/catalog-types";
import {
  buildCategoryIndex,
  visibleRoots,
  type CategoryInfo,
} from "./category-utils";

/** Loads the organization's levels once and indexes them by id. */
export function useCategoryIndex(): {
  index: Map<number, CategoryInfo>;
  loading: boolean;
  error: string;
} {
  const { orgVersion } = useSession();
  const [state, setState] = useState<{
    key: number;
    tree: CategoryNode[];
    error: string;
  } | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    apiRequest<CategoryNode[]>("/categories/tree", {
      signal: controller.signal,
    })
      .then((tree) => setState({ key: orgVersion, tree, error: "" }))
      .catch((failure) => {
        if (controller.signal.aborted) return;
        setState({
          key: orgVersion,
          tree: [],
          error:
            failure instanceof Error
              ? failure.message
              : "Levels failed to load.",
        });
      });
    return () => controller.abort();
  }, [orgVersion]);

  const current = state?.key === orgVersion ? state : null;
  const index = useMemo(
    () => buildCategoryIndex(visibleRoots(current?.tree ?? [])),
    [current],
  );
  return { index, loading: !current, error: current?.error ?? "" };
}
