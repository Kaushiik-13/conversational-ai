"use client";

import { useEffect, useState } from "react";
import { SearchX } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import type { CategoryInfo } from "@/components/catalog/category-utils";
import { apiRequestFull } from "@/lib/api";
import type {
  CatalogRecord,
  SearchItem,
  SearchMeta,
  SearchRequest,
} from "@/lib/catalog-types";
import { PartRows } from "./part-rows";

type Mode = "maker" | "level" | "vehicle";

const MODES: Array<{ key: Mode; label: string }> = [
  { key: "maker", label: "Same manufacturer" },
  { key: "level", label: "Same level" },
  { key: "vehicle", label: "Same vehicle" },
];

const SHOWN = 6;

function requestFor(part: CatalogRecord, mode: Mode): SearchRequest {
  const base = {
    facets: [] as never[],
    sort: { field: "partNumber" as const, direction: "asc" as const },
  };
  if (mode === "maker") {
    return {
      ...base,
      query: "",
      filters: { manufacturerNames: [part.manufacturer] },
      limit: SHOWN + 1,
    };
  }
  if (mode === "level") {
    return {
      ...base,
      query: "",
      filters: { primaryCategoryIds: [part.primaryCategoryId] },
      limit: SHOWN + 1,
    };
  }
  // The API has no exact vehicle filter, so search by name and keep exact matches.
  return { ...base, query: part.vehicleProgram, filters: {}, limit: 100 };
}

export function RelatedParts({
  part,
  index,
}: {
  part: CatalogRecord;
  index: Map<number, CategoryInfo>;
}) {
  const [mode, setMode] = useState<Mode>("maker");
  const key = `${part.id}:${mode}`;
  const [result, setResult] = useState<{
    key: string;
    items: SearchItem[];
    error: string;
  } | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    apiRequestFull<{ items: SearchItem[] }, SearchMeta>("/search", {
      method: "POST",
      body: requestFor(part, mode),
      signal: controller.signal,
    })
      .then((response) => {
        let items = response.data.items.filter((item) => item.id !== part.id);
        if (mode === "vehicle") {
          items = items.filter(
            (item) => item.vehicleProgram === part.vehicleProgram,
          );
        }
        setResult({ key, items: items.slice(0, SHOWN), error: "" });
      })
      .catch((failure) => {
        if (controller.signal.aborted) return;
        setResult({
          key,
          items: [],
          error:
            failure instanceof Error
              ? failure.message
              : "Related parts could not be loaded.",
        });
      });
    return () => controller.abort();
  }, [key, part, mode]);

  const loading = result?.key !== key;

  return (
    <section aria-labelledby="related-heading" className="rounded-xl border">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b p-4">
        <h2
          id="related-heading"
          className="font-mono text-[11px] tracking-wide text-muted-foreground uppercase"
        >
          Related parts
        </h2>
        <div role="tablist" aria-label="Related parts" className="flex gap-1">
          {MODES.map((entry) => (
            <button
              key={entry.key}
              type="button"
              role="tab"
              aria-selected={mode === entry.key}
              onClick={() => setMode(entry.key)}
              className={`rounded-full border px-3 py-1 text-xs transition-colors ${
                mode === entry.key
                  ? "border-hl-blue/25 bg-hl-blue/10 text-hl-blue"
                  : "border-border text-muted-foreground hover:bg-muted"
              }`}
            >
              {entry.label}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="space-y-2 p-4" aria-label="Loading related parts">
          {Array.from({ length: 3 }).map((_, row) => (
            <Skeleton key={row} className="h-10 w-full" />
          ))}
        </div>
      ) : result?.error ? (
        <p className="p-4 text-sm text-destructive" role="alert">
          {result.error}
        </p>
      ) : result && result.items.length === 0 ? (
        <div className="flex flex-col items-center gap-2 p-8 text-center">
          <SearchX className="size-6 text-muted-foreground" aria-hidden />
          <p className="text-sm text-muted-foreground">
            No other visible parts found.
          </p>
        </div>
      ) : result ? (
        <PartRows items={result.items} index={index} />
      ) : null}
    </section>
  );
}
