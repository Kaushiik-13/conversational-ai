import type { CategoryInfo } from "@/components/catalog/category-utils";
import type { CategoryNode } from "@/lib/catalog-types";
import { GROUPS, SLOTS, SLOT_BY_ID } from "./brake-slots";
import { FALLBACK_INFO, PART_INFO, type Kind } from "./part-info";
import type { Vec3 } from "./stage";

/** One clickable part, whatever scene draws it. */
export interface ListSlot {
  /** For braking this is the slot id; for other systems it is the level path. */
  id: string;
  /** The sub-level this part belongs to (used by the group chips). */
  group: string | null;
  label: string;
  /** The catalog level this part is filled from. */
  categoryPath: string;
  /** Pieces per set, when known. */
  quantity?: number;
  summary: string;
  connects?: string;
  color: string;
  /** Shape used in the schematic scenes. */
  kind: Kind;
  number: number;
}

export interface SystemGroup {
  id: string;
  label: string;
}

/** A vehicle system (the top levels of the catalog) the user may see. */
export interface SystemDef {
  /** Last label of the catalog path, e.g. "braking". */
  id: string;
  label: string;
  /** Catalog level id, for linking into the catalog. */
  levelId: number;
  color: string;
  /** True when this system has a detailed, hand-built 3D model. */
  detailed: boolean;
  groups: SystemGroup[];
  slots: ListSlot[];
}

export const SYSTEM_COLORS: Record<string, string> = {
  adas: "#0ea5e9",
  battery: "#16a34a",
  body: "#64748b",
  braking: "#e11d48",
  electrical: "#ca8a04",
  engine: "#ea580c",
  interior: "#a855f7",
  safety: "#dc2626",
  steering: "#2563eb",
  suspension: "#0d9488",
  thermal: "#06b6d4",
  transmission: "#7c3aed",
  tyres_wheels: "#475569",
};

/** Where each system's pin sits on the whole-vehicle model. */
export const SYSTEM_HOTSPOTS: Record<string, Vec3> = {
  adas: [0, 3.35, 0.7],
  battery: [0, 0.6, 3.1],
  body: [0, 4.45, 3.4],
  braking: [-2.3, 1.9, -3.5],
  electrical: [1.2, 2.1, -2.6],
  engine: [0, 2.15, -3.4],
  interior: [0.95, 2.2, 2.1],
  safety: [1.0, 2.0, 0.4],
  steering: [-1.0, 2.9, 1.6],
  suspension: [2.0, 2.7, -3.5],
  thermal: [0, 1.9, -5.2],
  transmission: [0, 0.65, -1.45],
  tyres_wheels: [2.3, 1.75, 3.5],
};

/** Part colours, handed out in order so neighbouring parts differ. */
const PALETTE = [
  "#2563eb",
  "#0d9488",
  "#d97706",
  "#e11d48",
  "#7c3aed",
  "#059669",
  "#ca8a04",
  "#db2777",
  "#0284c7",
  "#ea580c",
];

const lastLabel = (path: string) => path.split(".").pop() ?? path;
const withoutRoot = (path: string) => path.replace(/^automotive\./, "");

function leavesOf(node: CategoryNode): CategoryNode[] {
  const children = node.children ?? [];
  if (children.length === 0) return [node];
  return children.flatMap(leavesOf);
}

/** Builds one system from the part of the catalog tree the user can see. */
function buildSystem(node: CategoryNode, index: number): SystemDef {
  const id = lastLabel(node.path);
  const color = SYSTEM_COLORS[id] ?? "#64748b";

  if (id === "braking") {
    const visible = new Set(leavesOf(node).map((leaf) => leaf.path));
    const slots = SLOTS.filter((slot) => visible.has(slot.categoryPath)).map(
      (slot): ListSlot => ({
        id: slot.id,
        group: slot.group,
        label: slot.label,
        categoryPath: slot.categoryPath,
        quantity: slot.quantity,
        summary: slot.summary,
        connects: slot.connects,
        color: slot.color,
        kind: "box",
        number: SLOT_BY_ID[slot.id].number,
      }),
    );
    const used = new Set(slots.map((slot) => slot.group));
    return {
      id,
      label: node.name,
      levelId: node.id,
      color,
      detailed: true,
      groups: GROUPS.filter((group) => used.has(group.id)),
      slots,
    };
  }

  // Nested systems (like Steering) get a chip for each second-level group.
  const second = node.children ?? [];
  const nested = second.some((child) => (child.children ?? []).length > 0);
  const slots: ListSlot[] = [];
  for (const child of second.length > 0 ? second : [node]) {
    for (const leaf of leavesOf(child)) {
      const info = PART_INFO[withoutRoot(leaf.path)] ?? FALLBACK_INFO;
      slots.push({
        id: leaf.path,
        group: nested ? child.path : null,
        label: leaf.name,
        categoryPath: leaf.path,
        summary: info.summary,
        color: PALETTE[slots.length % PALETTE.length],
        kind: info.kind,
        number: slots.length + 1,
      });
    }
  }
  return {
    id,
    label: node.name,
    levelId: node.id,
    color: SYSTEM_COLORS[id] ?? PALETTE[index % PALETTE.length],
    detailed: id === "engine",
    groups: nested
      ? second.map((child) => ({ id: child.path, label: child.name }))
      : [],
    slots,
  };
}

/** The systems the signed-in user can see, in catalog order. */
export function buildSystems(levels: CategoryInfo[]): SystemDef[] {
  return levels
    .filter((info) => info.node.depth === 1)
    .map((info, order) => buildSystem(info.node, order))
    .filter((system) => system.slots.length > 0);
}
