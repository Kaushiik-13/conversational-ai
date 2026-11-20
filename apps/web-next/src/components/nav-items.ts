import {
  Boxes,
  GitCompareArrows,
  MessagesSquare,
  Network,
  ScrollText,
  ShieldCheck,
  Users,
  type LucideIcon,
} from "lucide-react";

export interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
  /** Capability the role needs to see this item. */
  capability: string;
  /** False while the page is not built yet. */
  ready: boolean;
  /** "main" items are everyday tools; "manage" items are administration. */
  group: "main" | "manage";
}

export const NAV: NavItem[] = [
  {
    label: "Catalog",
    href: "/catalog",
    icon: Boxes,
    capability: "catalog.search",
    ready: true,
    group: "main",
  },
  {
    label: "Ask AI",
    href: "/chat",
    icon: MessagesSquare,
    capability: "catalog.read",
    ready: false,
    group: "main",
  },
  {
    label: "Compare",
    href: "/compare",
    icon: GitCompareArrows,
    capability: "catalog.read",
    ready: true,
    group: "main",
  },
  {
    label: "People",
    href: "/users",
    icon: Users,
    capability: "organization.users.read",
    ready: false,
    group: "manage",
  },
  {
    label: "Organization access",
    href: "/entitlements",
    icon: ShieldCheck,
    capability: "organization.entitlements.read",
    ready: false,
    group: "manage",
  },
  {
    label: "Taxonomy",
    href: "/taxonomy",
    icon: Network,
    capability: "taxonomy.manage",
    ready: false,
    group: "manage",
  },
  {
    label: "Audit trail",
    href: "/audit",
    icon: ScrollText,
    capability: "audit.read",
    ready: false,
    group: "manage",
  },
];

export function initials(name: string): string {
  const words = name.split(/\s+/).filter(Boolean);
  if (words.length === 0) return "?";
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return words
    .slice(0, 2)
    .map((word) => word.charAt(0).toUpperCase())
    .join("");
}

/** Pages that belong to a nav item (e.g. part and vehicle pages sit under Catalog). */
const EXTRA_PREFIXES: Record<string, string[]> = {
  "/catalog": ["/vehicles"],
};

export function isNavActive(item: NavItem, pathname: string): boolean {
  const prefixes = [item.href, ...(EXTRA_PREFIXES[item.href] ?? [])];
  return prefixes.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}
