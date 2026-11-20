import type { CategoryNode } from "@/lib/catalog-types";

export interface CategoryInfo {
  node: CategoryNode;
  /** The security domain this level belongs to (itself when it is one). */
  domain: CategoryNode | null;
  /** Names from the top level down to this one, e.g. Braking > Brake pads. */
  trail: CategoryNode[];
}

/** Levels shown to the user: the children of the single hidden root. */
export function visibleRoots(tree: CategoryNode[]): CategoryNode[] {
  if (tree.length === 1 && tree[0].depth === 0 && !tree[0].isSecurityDomain) {
    return tree[0].children ?? [];
  }
  return tree;
}

export function buildCategoryIndex(
  roots: CategoryNode[],
): Map<number, CategoryInfo> {
  const index = new Map<number, CategoryInfo>();
  const walk = (
    node: CategoryNode,
    trail: CategoryNode[],
    domain: CategoryNode | null,
  ) => {
    const nextDomain = node.isSecurityDomain ? node : domain;
    const nextTrail = [...trail, node];
    index.set(node.id, { node, domain: nextDomain, trail: nextTrail });
    for (const child of node.children ?? []) walk(child, nextTrail, nextDomain);
  };
  for (const root of roots) walk(root, [], null);
  return index;
}

/** The node and every level below it. */
export function collectIds(node: CategoryNode): number[] {
  const ids = [node.id];
  for (const child of node.children ?? []) ids.push(...collectIds(child));
  return ids;
}

export function countLevels(roots: CategoryNode[]): number {
  return roots.reduce(
    (total, node) => total + 1 + countLevels(node.children ?? []),
    0,
  );
}

export interface EntitlementEntry {
  categoryId: number;
  effect: "allow" | "deny";
  includeDescendants: boolean;
}

/**
 * Levels an organization may use: every allowed level (and its descendants when
 * requested) minus every denied one.
 */
export function computeAllowedIds(
  entries: EntitlementEntry[],
  index: Map<number, CategoryInfo>,
): Set<number> {
  const expand = (entry: EntitlementEntry): number[] => {
    const info = index.get(entry.categoryId);
    if (!info) return [entry.categoryId];
    return entry.includeDescendants
      ? collectIds(info.node)
      : [entry.categoryId];
  };
  const allowed = new Set<number>();
  for (const entry of entries) {
    if (entry.effect === "allow")
      expand(entry).forEach((id) => allowed.add(id));
  }
  for (const entry of entries) {
    if (entry.effect === "deny")
      expand(entry).forEach((id) => allowed.delete(id));
  }
  return allowed;
}
