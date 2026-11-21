"use client";

import { useEffect, useState } from "react";
import { Check, Plus, Search } from "lucide-react";
import { StatusBadge } from "@/components/catalog/status-badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { apiRequestFull } from "@/lib/api";
import type { SearchItem, SearchMeta } from "@/lib/catalog-types";
import type { CompareEntry } from "@/lib/compare-store";

const RESULTS = 8;

/** Search for parts and add them to the comparison without leaving the page. */
export function PartPicker({
  selectedIds,
  full,
  max,
  onAdd,
  autoFocus = false,
}: {
  selectedIds: number[];
  full: boolean;
  max: number;
  onAdd: (entry: CompareEntry) => void;
  autoFocus?: boolean;
}) {
  const [text, setText] = useState("");
  const [term, setTerm] = useState("");
  const [result, setResult] = useState<{
    term: string;
    items: SearchItem[];
    error: string;
  } | null>(null);

  // Wait for a short pause in typing before searching.
  useEffect(() => {
    const timer = setTimeout(() => setTerm(text.trim()), 300);
    return () => clearTimeout(timer);
  }, [text]);

  useEffect(() => {
    if (!term) return;
    const controller = new AbortController();
    apiRequestFull<{ items: SearchItem[] }, SearchMeta>("/search", {
      method: "POST",
      body: {
        query: term,
        facets: [],
        sort: { field: "relevance", direction: "desc" },
        limit: RESULTS,
      },
      signal: controller.signal,
    })
      .then((response) =>
        setResult({ term, items: response.data.items, error: "" }),
      )
      .catch((failure) => {
        if (controller.signal.aborted) return;
        setResult({
          term,
          items: [],
          error:
            failure instanceof Error
              ? failure.message
              : "Search failed. Try again.",
        });
      });
    return () => controller.abort();
  }, [term]);

  const searching = term !== "" && result?.term !== term;
  const shown = term !== "" && result?.term === term ? result : null;

  return (
    <div className="w-full max-w-2xl space-y-3 text-left">
      <label className="relative block">
        <span className="sr-only">Search for a part to compare</span>
        <Search
          className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
          aria-hidden
        />
        <input
          type="search"
          value={text}
          onChange={(event) => setText(event.target.value)}
          placeholder="Search by part number or name, e.g. brake caliper"
          autoFocus={autoFocus}
          className="h-11 w-full rounded-lg border bg-background pr-3 pl-9 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30"
        />
      </label>

      {term === "" ? (
        <p className="text-sm text-muted-foreground">
          Type to find parts, then press Add. You can compare up to {max}.
        </p>
      ) : searching ? (
        <div className="space-y-2" aria-label="Searching">
          {Array.from({ length: 3 }).map((_, row) => (
            <Skeleton key={row} className="h-14 w-full" />
          ))}
        </div>
      ) : shown?.error ? (
        <p className="text-sm text-destructive" role="alert">
          {shown.error}
        </p>
      ) : shown && shown.items.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No visible parts match &ldquo;{shown.term}&rdquo;.
        </p>
      ) : (
        <ul className="divide-y rounded-lg border">
          {shown?.items.map((item) => {
            const added = selectedIds.includes(item.id);
            return (
              <li key={item.id} className="flex items-center gap-3 p-3">
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-x-2">
                    <span className="font-mono text-xs text-hl-blue">
                      {item.partNumber}
                    </span>
                    <span className="truncate text-sm font-medium">
                      {item.partName}
                    </span>
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {item.manufacturer} · {item.region} · {item.modelYear}
                  </p>
                </div>
                <StatusBadge status={item.lifecycleStatus} />
                <Button
                  variant={added ? "secondary" : "outline"}
                  size="sm"
                  disabled={added || full}
                  title={
                    full && !added
                      ? `You can compare up to ${max} parts`
                      : undefined
                  }
                  onClick={() =>
                    onAdd({
                      id: item.id,
                      partNumber: item.partNumber,
                      partName: item.partName,
                    })
                  }
                >
                  {added ? <Check /> : <Plus />}
                  {added ? "Added" : "Add"}
                </Button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
