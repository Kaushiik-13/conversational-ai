"use client";

import { Check, ChevronDown, ChevronRight, Lock } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import type { CategoryNode } from "@/lib/catalog-types";
import { HUE_DOT, HUE_UNDERLINE, domainHue } from "@/lib/highlights";
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

const TAB_ROW =
  "flex items-center gap-1 overflow-x-auto px-4 pt-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden";

/** One step of the path, as a dropdown listing its siblings. */
function LevelStep({
  parent,
  chosen,
  isLocked,
  onSelect,
}: {
  parent: CategoryNode;
  chosen: CategoryNode | null;
  isLocked: (node: CategoryNode) => boolean;
  onSelect: (node: CategoryNode) => void;
}) {
  const children = parent.children ?? [];
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <button
            type="button"
            className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-sm transition-colors hover:bg-muted ${
              chosen ? "font-medium" : "text-muted-foreground"
            }`}
          />
        }
      >
        {chosen ? chosen.name : `All ${parent.name}`}
        <ChevronDown className="size-3.5 text-muted-foreground" aria-hidden />
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        className="max-h-80 min-w-48 overflow-y-auto"
      >
        <DropdownMenuItem onClick={() => onSelect(parent)}>
          <span className="flex-1">All {parent.name}</span>
          {chosen === null ? <Check className="size-4" aria-hidden /> : null}
        </DropdownMenuItem>
        {children.map((child) => {
          const locked = isLocked(child);
          return (
            <DropdownMenuItem
              key={child.id}
              disabled={locked}
              onClick={() => onSelect(child)}
            >
              <span className="flex-1">{child.name}</span>
              {locked ? (
                <Lock className="size-3.5" aria-label="Locked" />
              ) : chosen?.id === child.id ? (
                <Check className="size-4" aria-hidden />
              ) : null}
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

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

  // Each open level that has children below it gets one dropdown step.
  const steps: Array<{ parent: CategoryNode; chosen: CategoryNode | null }> =
    [];
  for (let depth = 0; depth < trail.length; depth += 1) {
    if ((trail[depth].children ?? []).length === 0) break;
    steps.push({ parent: trail[depth], chosen: trail[depth + 1] ?? null });
  }
  const domain = trail[0];

  return (
    <nav aria-label="Catalog levels" className="border-b">
      {/* Domains as tabs */}
      <div className={TAB_ROW}>
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
        {roots.map((root) => {
          const hue = domainHue(root.id);
          const selected = domain?.id === root.id;
          const locked = isLocked(root);
          return (
            <button
              key={root.id}
              type="button"
              onClick={() => !locked && onSelect(root)}
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
              {root.name}
              {locked ? <Lock className="size-3" aria-label="Locked" /> : null}
            </button>
          );
        })}
      </div>

      {/* Where you are: one line, each step is a dropdown */}
      {domain ? (
        <div className="flex items-center gap-0.5 overflow-x-auto border-t bg-secondary/40 px-4 py-1.5 text-sm [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <span className="flex shrink-0 items-center gap-2 px-2 py-1 font-medium">
            <span
              aria-hidden
              className={`size-2 rounded-full ${HUE_DOT[domainHue(domain.id)]}`}
            />
            {domain.name}
          </span>
          {steps.map((step) => (
            <span key={step.parent.id} className="flex shrink-0 items-center">
              <ChevronRight
                className="size-3.5 text-muted-foreground"
                aria-hidden
              />
              <LevelStep
                parent={step.parent}
                chosen={step.chosen}
                isLocked={isLocked}
                onSelect={onSelect}
              />
            </span>
          ))}
        </div>
      ) : null}
    </nav>
  );
}
