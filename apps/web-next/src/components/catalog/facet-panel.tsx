"use client";

import { useMemo, useState } from "react";
import { Check, ChevronDown, SlidersHorizontal } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  FACET_LABELS,
  FACET_NAMES,
  type FacetBucket,
  type FacetName,
} from "@/lib/catalog-types";
import { HUE_DOT, statusHue } from "@/lib/highlights";

export interface FacetState {
  buckets: FacetBucket[] | null;
  loading: boolean;
  error: boolean;
  retry: () => void;
}

export type Picked = Record<FacetName, string[]>;

interface FacetPanelProps {
  facets: Record<FacetName, FacetState>;
  picked: Picked;
  onToggle: (facet: FacetName, value: string) => void;
  yearFrom: string;
  yearTo: string;
  onYearFrom: (value: string) => void;
  onYearTo: (value: string) => void;
  activeCount: number;
  onClear: () => void;
}

const COLLAPSED_ROWS = 8;
const SEARCH_THRESHOLD = 10;

function FacetSection({
  name,
  state,
  picked,
  onToggle,
}: {
  name: FacetName;
  state: FacetState;
  picked: string[];
  onToggle: (value: string) => void;
}) {
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState(false);

  // Picked values are always shown, even if the current counts do not list them.
  const rows = useMemo(() => {
    const byValue = new Map<string, number | null>();
    for (const bucket of state.buckets ?? [])
      byValue.set(bucket.value, bucket.count);
    for (const value of picked)
      if (!byValue.has(value)) byValue.set(value, null);
    return [...byValue.entries()]
      .map(([value, count]) => ({ value, count }))
      .sort((left, right) => {
        const leftPicked = picked.includes(left.value);
        const rightPicked = picked.includes(right.value);
        if (leftPicked !== rightPicked) return leftPicked ? -1 : 1;
        return (
          (right.count ?? 0) - (left.count ?? 0) ||
          left.value.localeCompare(right.value)
        );
      });
  }, [state.buckets, picked]);

  const needle = search.trim().toLowerCase();
  const filtered = needle
    ? rows.filter((row) => row.value.toLowerCase().includes(needle))
    : rows;
  const shown =
    expanded || needle ? filtered : filtered.slice(0, COLLAPSED_ROWS);
  const hidden = filtered.length - shown.length;

  return (
    <details open className="group border-t px-4 py-3">
      <summary className="flex cursor-pointer list-none items-center justify-between text-sm font-medium">
        <span className="flex items-center gap-2">
          {FACET_LABELS[name]}
          {picked.length > 0 ? (
            <span className="rounded-full bg-hl-blue/12 px-1.5 font-mono text-[10px] text-hl-blue">
              {picked.length}
            </span>
          ) : null}
        </span>
        <ChevronDown
          className="size-4 text-muted-foreground transition-transform group-open:rotate-180"
          aria-hidden
        />
      </summary>

      <div className="mt-2 space-y-1">
        {rows.length > SEARCH_THRESHOLD ? (
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={`Find ${FACET_LABELS[name].toLowerCase()}…`}
            aria-label={`Find ${FACET_LABELS[name].toLowerCase()}`}
            className="mb-2 h-8 text-xs"
          />
        ) : null}

        {state.loading && state.buckets === null ? (
          <div
            className="space-y-1.5"
            aria-label={`Loading ${FACET_LABELS[name]}`}
          >
            {Array.from({ length: 4 }).map((_, row) => (
              <Skeleton key={row} className="h-6 w-full" />
            ))}
          </div>
        ) : state.error && rows.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            Counts unavailable.{" "}
            <button
              type="button"
              onClick={state.retry}
              className="underline underline-offset-4"
            >
              Try again
            </button>
          </p>
        ) : filtered.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            {needle ? "No match" : "No values for this selection"}
          </p>
        ) : (
          <ul className={state.loading ? "opacity-60 transition-opacity" : ""}>
            {shown.map((row) => {
              const selected = picked.includes(row.value);
              return (
                <li key={row.value}>
                  <button
                    type="button"
                    role="checkbox"
                    aria-checked={selected}
                    onClick={() => onToggle(row.value)}
                    className={`flex w-full items-center gap-2 rounded-md px-1.5 py-1 text-left text-sm ${
                      selected ? "bg-hl-blue/10" : "hover:bg-muted"
                    }`}
                  >
                    <span
                      aria-hidden
                      className={`flex size-4 shrink-0 items-center justify-center rounded border ${
                        selected
                          ? "border-hl-blue bg-hl-blue text-background"
                          : "border-input"
                      }`}
                    >
                      {selected ? <Check className="size-3" /> : null}
                    </span>
                    {name === "lifecycleStatus" ? (
                      <span
                        aria-hidden
                        className={`size-2 shrink-0 rounded-full ${HUE_DOT[statusHue(row.value)]}`}
                      />
                    ) : null}
                    <span className="min-w-0 flex-1 truncate first-letter:uppercase">
                      {row.value}
                    </span>
                    <span className="font-mono text-xs text-muted-foreground tabular-nums">
                      {row.count === null ? "—" : row.count.toLocaleString()}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}

        {hidden > 0 ? (
          <button
            type="button"
            onClick={() => setExpanded(true)}
            className="px-1.5 pt-1 text-xs text-hl-blue underline-offset-4 hover:underline"
          >
            Show {hidden} more
          </button>
        ) : expanded && filtered.length > COLLAPSED_ROWS ? (
          <button
            type="button"
            onClick={() => setExpanded(false)}
            className="px-1.5 pt-1 text-xs text-muted-foreground underline-offset-4 hover:underline"
          >
            Show fewer
          </button>
        ) : null}
      </div>
    </details>
  );
}

export function FacetPanel({
  facets,
  picked,
  onToggle,
  yearFrom,
  yearTo,
  onYearFrom,
  onYearTo,
  activeCount,
  onClear,
}: FacetPanelProps) {
  return (
    <div className="pb-4">
      <div className="flex items-center justify-between px-4 pt-3 pb-2">
        <h2 className="flex items-center gap-2 font-mono text-[11px] tracking-wide text-muted-foreground uppercase">
          <SlidersHorizontal className="size-4" aria-hidden />
          Filters
        </h2>
        {activeCount > 0 ? (
          <button
            type="button"
            onClick={onClear}
            className="text-xs text-hl-blue underline-offset-4 hover:underline"
          >
            Clear ({activeCount})
          </button>
        ) : null}
      </div>

      {FACET_NAMES.map((name) => (
        <FacetSection
          key={name}
          name={name}
          state={facets[name]}
          picked={picked[name]}
          onToggle={(value) => onToggle(name, value)}
        />
      ))}

      <div className="border-t px-4 py-3">
        <p className="pb-2 text-sm font-medium">Model year</p>
        <div className="flex items-center gap-2">
          <Input
            inputMode="numeric"
            placeholder="From"
            aria-label="Model year from"
            className="h-8"
            value={yearFrom}
            onChange={(event) =>
              onYearFrom(event.target.value.replace(/\D/g, "").slice(0, 4))
            }
          />
          <span className="text-muted-foreground">–</span>
          <Input
            inputMode="numeric"
            placeholder="To"
            aria-label="Model year to"
            className="h-8"
            value={yearTo}
            onChange={(event) =>
              onYearTo(event.target.value.replace(/\D/g, "").slice(0, 4))
            }
          />
        </div>
      </div>
    </div>
  );
}
