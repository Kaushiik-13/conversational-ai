"use client";

import { useMemo, useState } from "react";
import { ChevronRight, Layers, Lock } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import type { CategoryNode } from "@/lib/catalog-types";
import { HUE_DOT, domainHue } from "@/lib/highlights";
import type { CategoryInfo } from "./category-utils";

interface LevelsTreeProps {
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

function TreeRow({
  node,
  depth,
  hueId,
  expanded,
  selectedId,
  allowedIds,
  toggle,
  onSelect,
}: {
  node: CategoryNode;
  depth: number;
  hueId: number;
  expanded: Set<number>;
  selectedId: number | null;
  allowedIds: Set<number> | null;
  toggle: (id: number) => void;
  onSelect: (node: CategoryNode) => void;
}) {
  const children = node.children ?? [];
  const hasChildren = children.length > 0;
  const isOpen = expanded.has(node.id);
  const isSelected = selectedId === node.id;
  const isLocked = allowedIds?.has(node.id) === false;

  return (
    <li role="none">
      <div
        role="treeitem"
        aria-selected={isSelected}
        aria-expanded={hasChildren ? isOpen : undefined}
        className={`group flex items-center rounded-md text-sm ${
          isSelected ? "bg-hl-blue/10 text-hl-blue" : "hover:bg-muted"
        } ${isLocked ? "opacity-50" : ""}`}
        style={{ paddingLeft: depth * 14 }}
      >
        <button
          type="button"
          aria-label={isOpen ? `Collapse ${node.name}` : `Expand ${node.name}`}
          tabIndex={hasChildren ? 0 : -1}
          onClick={() => hasChildren && toggle(node.id)}
          className={`flex size-7 shrink-0 items-center justify-center text-muted-foreground ${
            hasChildren ? "" : "invisible"
          }`}
        >
          <ChevronRight
            className={`size-3.5 transition-transform ${isOpen ? "rotate-90" : ""}`}
            aria-hidden
          />
        </button>
        <button
          type="button"
          onClick={() => !isLocked && onSelect(node)}
          aria-disabled={isLocked || undefined}
          title={
            isLocked ? "Not included in this organization's plan" : undefined
          }
          className={`flex min-w-0 flex-1 items-center gap-2 py-1.5 pr-2 text-left ${
            isLocked ? "cursor-not-allowed" : ""
          }`}
        >
          <span
            aria-hidden
            className={`size-2 shrink-0 rounded-full ${
              depth === 0 ? HUE_DOT[domainHue(hueId)] : "bg-border"
            }`}
          />
          <span className={`truncate ${isSelected ? "font-medium" : ""}`}>
            {node.name}
          </span>
          {isLocked ? (
            <Lock className="ml-auto size-3 shrink-0" aria-label="Locked" />
          ) : null}
        </button>
      </div>
      {hasChildren && isOpen ? (
        <ul role="group">
          {children.map((child) => (
            <TreeRow
              key={child.id}
              node={child}
              depth={depth + 1}
              hueId={hueId}
              expanded={expanded}
              selectedId={selectedId}
              allowedIds={allowedIds}
              toggle={toggle}
              onSelect={onSelect}
            />
          ))}
        </ul>
      ) : null}
    </li>
  );
}

export function LevelsTree({
  roots,
  index,
  selectedId,
  loading,
  error,
  allowedIds,
  onSelect,
  onRetry,
}: LevelsTreeProps) {
  // Levels the user opened or closed by hand; the path to the selected level
  // is open unless they closed it.
  const [manual, setManual] = useState<Map<number, boolean>>(new Map());
  const pathIds = useMemo(() => {
    const info = selectedId === null ? undefined : index.get(selectedId);
    return new Set((info?.trail ?? []).slice(0, -1).map((node) => node.id));
  }, [selectedId, index]);
  const expanded = useMemo(() => {
    const open = new Set<number>(pathIds);
    for (const [id, value] of manual) {
      if (value) open.add(id);
      else open.delete(id);
    }
    return open;
  }, [pathIds, manual]);

  const toggle = (id: number) =>
    setManual((current) => {
      const next = new Map(current);
      next.set(id, !expanded.has(id));
      return next;
    });

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 px-4 pt-4 pb-2">
        <Layers className="size-4 text-muted-foreground" aria-hidden />
        <h2 className="font-mono text-[11px] tracking-wide text-muted-foreground uppercase">
          Levels
        </h2>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-4">
        <button
          type="button"
          onClick={() => onSelect(null)}
          className={`mb-1 flex w-full items-center gap-2 rounded-md px-3 py-1.5 text-left text-sm ${
            selectedId === null
              ? "bg-hl-blue/10 font-medium text-hl-blue"
              : "hover:bg-muted"
          }`}
        >
          All levels
        </button>

        {loading ? (
          <div className="space-y-2 px-2 pt-2" aria-label="Loading levels">
            {Array.from({ length: 8 }).map((_, row) => (
              <Skeleton key={row} className="h-6 w-full" />
            ))}
          </div>
        ) : error ? (
          <div className="space-y-2 px-3 pt-2 text-sm">
            <p className="text-destructive">{error}</p>
            <button
              type="button"
              onClick={onRetry}
              className="underline underline-offset-4"
            >
              Try again
            </button>
          </div>
        ) : roots.length === 0 ? (
          <p className="px-3 pt-2 text-sm text-muted-foreground">
            No levels are available to your organization.
          </p>
        ) : (
          <ul role="tree" aria-label="Catalog levels">
            {roots.map((root) => (
              <TreeRow
                key={root.id}
                node={root}
                depth={0}
                hueId={root.id}
                expanded={expanded}
                selectedId={selectedId}
                allowedIds={allowedIds}
                toggle={toggle}
                onSelect={onSelect}
              />
            ))}
          </ul>
        )}
        {allowedIds && !loading && !error ? (
          <p className="mt-3 flex items-center gap-1.5 px-3 text-xs text-muted-foreground">
            <Lock className="size-3" aria-hidden /> Locked levels aren&apos;t in
            this organization&apos;s plan.
          </p>
        ) : null}
      </div>
    </div>
  );
}
