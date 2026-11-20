"use client";

import { Lock } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import type { CategoryNode } from "@/lib/catalog-types";
import { HUE_BADGE, HUE_DOT, HUE_UNDERLINE, domainHue } from "@/lib/highlights";
import type { CategoryInfo } from "./category-utils";

interface LevelsBarProps {
  roots: CategoryNode[];
  index: Map<number, CategoryInfo>;
  selectedId: number | null;
  loading: boolean;
  error: string;
  /** Levels the active organization may use; null when unknown (non-admins). */
  allowedIds: Set<number> | null;
  onSelect: (node: CategoryNode | null) => void;
  onRetry: () => void;
}

const SCROLL_ROW =
  "flex items-center gap-1 overflow-x-auto px-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden";

export function LevelsBar({
  roots,
  index,
  selectedId,
  loading,
  error,
  allowedIds,
  onSelect,
  onRetry,
}: LevelsBarProps) {
  const trail =
    (selectedId === null ? undefined : index.get(selectedId))?.trail ?? [];
  const isLocked = (node: CategoryNode) =>
    allowedIds !== null && !allowedIds.has(node.id);

  // One extra row for each open level that has children below it.
  const subRows: Array<{
    parent: CategoryNode;
    items: CategoryNode[];
    selected: number | null;
  }> = [];
  for (let depth = 0; depth < trail.length; depth += 1) {
    const children = trail[depth].children ?? [];
    if (children.length === 0) break;
    subRows.push({
      parent: trail[depth],
      items: children,
      selected: trail[depth + 1]?.id ?? null,
    });
  }

  if (loading) {
    return (
      <div
        className="flex gap-2 border-b px-4 py-3"
        aria-label="Loading levels"
      >
        {Array.from({ length: 8 }).map((_, item) => (
          <Skeleton key={item} className="h-7 w-24 shrink-0" />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center gap-3 border-b px-4 py-3 text-sm">
        <span className="text-destructive">{error}</span>
        <button
          type="button"
          onClick={onRetry}
          className="underline underline-offset-4"
        >
          Try again
        </button>
      </div>
    );
  }

  if (roots.length === 0) {
    return (
      <p className="border-b px-4 py-3 text-sm text-muted-foreground">
        No levels are available to your organization.
      </p>
    );
  }

  return (
    <nav aria-label="Catalog levels" className="border-b">
      {/* Top level: domains as tabs */}
      <div className={`${SCROLL_ROW} pt-1`}>
        <button
          type="button"
          onClick={() => onSelect(null)}
          aria-current={selectedId === null ? "true" : undefined}
          className={`shrink-0 border-b-2 px-3 py-2 text-sm whitespace-nowrap ${
            selectedId === null
              ? "border-foreground font-medium"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          All
        </button>
        {roots.map((domain) => {
          const hue = domainHue(domain.id);
          const selected = trail[0]?.id === domain.id;
          const locked = isLocked(domain);
          return (
            <button
              key={domain.id}
              type="button"
              onClick={() => !locked && onSelect(domain)}
              aria-current={selected ? "true" : undefined}
              aria-disabled={locked || undefined}
              title={
                locked ? "Not included in this organization's plan" : undefined
              }
              className={`flex shrink-0 items-center gap-2 border-b-2 px-3 py-2 text-sm whitespace-nowrap ${
                selected
                  ? `${HUE_UNDERLINE[hue]} font-medium`
                  : "border-transparent text-muted-foreground hover:text-foreground"
              } ${locked ? "cursor-not-allowed opacity-45" : ""}`}
            >
              <span
                aria-hidden
                className={`size-2 rounded-full ${HUE_DOT[hue]}`}
              />
              {domain.name}
              {locked ? <Lock className="size-3" aria-label="Locked" /> : null}
            </button>
          );
        })}
      </div>

      {/* Lower levels: pills, one row per open level */}
      {subRows.map((row) => {
        const hue = domainHue(trail[0].id);
        return (
          <div key={row.parent.id} className={`${SCROLL_ROW} pb-2`}>
            {[null, ...row.items].map((item) => {
              const node = item ?? row.parent;
              const selected =
                item === null
                  ? selectedId === row.parent.id
                  : row.selected === item.id;
              const locked = item !== null && isLocked(item);
              return (
                <button
                  key={node.id + (item === null ? "-all" : "")}
                  type="button"
                  onClick={() => !locked && onSelect(node)}
                  aria-pressed={selected}
                  aria-disabled={locked || undefined}
                  className={`flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1 text-xs whitespace-nowrap transition-colors ${
                    selected
                      ? HUE_BADGE[hue]
                      : "border-border text-muted-foreground hover:bg-muted hover:text-foreground"
                  } ${locked ? "cursor-not-allowed opacity-45" : ""}`}
                >
                  {item === null ? `All ${row.parent.name}` : item.name}
                  {locked ? (
                    <Lock className="size-3" aria-label="Locked" />
                  ) : null}
                </button>
              );
            })}
          </div>
        );
      })}
    </nav>
  );
}
