"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { GitCompareArrows, SearchX } from "lucide-react";
import { CompareCheckbox } from "@/components/compare/compare-checkbox";
import { useCompare } from "@/components/compare/use-compare";
import { StatusBadge } from "@/components/catalog/status-badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { apiRequestFull } from "@/lib/api";
import type {
  CatalogRecord,
  SearchItem,
  SearchMeta,
} from "@/lib/catalog-types";

const SHOWN = 6;
const CANDIDATES = 50;

interface Suggestion {
  item: SearchItem;
  reasons: string[];
}

/**
 * Ranks parts from the same level by how many key fields they share with the
 * viewed part. The search score (text match) only breaks ties.
 */
export function rankSimilar(
  part: CatalogRecord,
  candidates: SearchItem[],
): Suggestion[] {
  return candidates
    .filter((item) => item.id !== part.id)
    .map((item) => {
      const reasons: string[] = [];
      if (item.manufacturer === part.manufacturer) reasons.push("Same maker");
      if (item.region === part.region) reasons.push("Same region");
      if (item.material === part.material) reasons.push("Same material");
      if (item.modelYear === part.modelYear) reasons.push("Same year");
      if (item.vehicleProgram === part.vehicleProgram) {
        reasons.push("Same vehicle");
      }
      return { item, reasons };
    })
    .sort(
      (a, b) =>
        b.reasons.length - a.reasons.length || b.item.score - a.item.score,
    )
    .slice(0, SHOWN);
}

export function SimilarParts({ part }: { part: CatalogRecord }) {
  const compare = useCompare();
  const [result, setResult] = useState<{
    id: number;
    suggestions: Suggestion[];
    error: string;
  } | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    apiRequestFull<{ items: SearchItem[] }, SearchMeta>("/search", {
      method: "POST",
      body: {
        query: part.partName,
        filters: { primaryCategoryIds: [part.primaryCategoryId] },
        facets: [],
        sort: { field: "relevance", direction: "desc" },
        limit: CANDIDATES,
      },
      signal: controller.signal,
    })
      .then((response) =>
        setResult({
          id: part.id,
          suggestions: rankSimilar(part, response.data.items),
          error: "",
        }),
      )
      .catch((failure) => {
        if (controller.signal.aborted) return;
        setResult({
          id: part.id,
          suggestions: [],
          error:
            failure instanceof Error
              ? failure.message
              : "Similar parts could not be loaded.",
        });
      });
    return () => controller.abort();
  }, [part]);

  const loading = result?.id !== part.id;

  function compareAll() {
    if (!result) return;
    const wanted = [part, ...result.suggestions.map((entry) => entry.item)];
    for (const entry of wanted) {
      if (compare.has(entry.id)) continue;
      if (
        !compare.toggle({
          id: entry.id,
          partNumber: entry.partNumber,
          partName: entry.partName,
        })
      ) {
        break;
      }
    }
  }

  return (
    <section aria-labelledby="similar-heading" className="rounded-xl border">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b p-4">
        <div>
          <h2
            id="similar-heading"
            className="font-mono text-[11px] tracking-wide text-muted-foreground uppercase"
          >
            Similar parts
          </h2>
          <p className="text-xs text-muted-foreground">
            Same level, ranked by shared maker, region, material, year and
            vehicle.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          disabled={loading || !result || result.suggestions.length === 0}
          onClick={compareAll}
        >
          <GitCompareArrows />
          Add top picks to compare
        </Button>
      </div>

      {loading ? (
        <div className="space-y-2 p-4" aria-label="Loading similar parts">
          {Array.from({ length: 3 }).map((_, row) => (
            <Skeleton key={row} className="h-12 w-full" />
          ))}
        </div>
      ) : result?.error ? (
        <p className="p-4 text-sm text-destructive" role="alert">
          {result.error}
        </p>
      ) : result && result.suggestions.length === 0 ? (
        <div className="flex flex-col items-center gap-2 p-8 text-center">
          <SearchX className="size-6 text-muted-foreground" aria-hidden />
          <p className="text-sm text-muted-foreground">
            No similar visible parts found.
          </p>
        </div>
      ) : (
        <ul className="divide-y">
          {result?.suggestions.map(({ item, reasons }) => (
            <li key={item.id} className="flex items-center gap-3 px-4 py-3">
              <CompareCheckbox
                part={{
                  id: item.id,
                  partNumber: item.partNumber,
                  partName: item.partName,
                }}
              />
              <div className="min-w-0 flex-1 space-y-1">
                <p className="flex flex-wrap items-center gap-x-2">
                  <Link
                    href={`/catalog/${item.id}`}
                    className="font-mono text-xs text-hl-blue underline-offset-4 hover:underline"
                  >
                    {item.partNumber}
                  </Link>
                  <span className="truncate font-medium">{item.partName}</span>
                </p>
                <p className="text-xs text-muted-foreground">
                  {item.manufacturer} · {item.region} · {item.modelYear}
                </p>
                {reasons.length > 0 ? (
                  <p className="flex flex-wrap gap-1">
                    {reasons.map((reason) => (
                      <span
                        key={reason}
                        className="rounded-full border border-hl-emerald/25 bg-hl-emerald/10 px-2 py-0.5 text-[11px] text-hl-emerald"
                      >
                        {reason}
                      </span>
                    ))}
                  </p>
                ) : null}
              </div>
              <StatusBadge status={item.lifecycleStatus} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
