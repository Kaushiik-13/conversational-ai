/**
 * Highlight colours. The UI is black, white and grey; these are used only to
 * give meaning to status, role and level.
 */
export type Hue =
  | "blue"
  | "emerald"
  | "amber"
  | "rose"
  | "violet"
  | "teal"
  | "orange"
  | "slate";

// Full class strings so Tailwind can see them.
export const HUE_BADGE: Record<Hue, string> = {
  blue: "bg-hl-blue/12 text-hl-blue border-hl-blue/25",
  emerald: "bg-hl-emerald/12 text-hl-emerald border-hl-emerald/25",
  amber: "bg-hl-amber/14 text-hl-amber border-hl-amber/30",
  rose: "bg-hl-rose/12 text-hl-rose border-hl-rose/25",
  violet: "bg-hl-violet/12 text-hl-violet border-hl-violet/25",
  teal: "bg-hl-teal/12 text-hl-teal border-hl-teal/25",
  orange: "bg-hl-orange/12 text-hl-orange border-hl-orange/25",
  slate: "bg-hl-slate/12 text-hl-slate border-hl-slate/25",
};

export const HUE_DOT: Record<Hue, string> = {
  blue: "bg-hl-blue",
  emerald: "bg-hl-emerald",
  amber: "bg-hl-amber",
  rose: "bg-hl-rose",
  violet: "bg-hl-violet",
  teal: "bg-hl-teal",
  orange: "bg-hl-orange",
  slate: "bg-hl-slate",
};

const STATUS_HUE: Record<string, Hue> = {
  active: "emerald",
  prototype: "blue",
  superseded: "amber",
  obsolete: "rose",
  "end-of-life": "slate",
};

export const statusHue = (status: string): Hue =>
  STATUS_HUE[status.toLowerCase()] ?? "slate";

const ROLE_HUE: Record<string, Hue> = {
  GLOBAL_ADMIN: "violet",
  ORG_ADMIN: "blue",
  ANALYST: "teal",
  VIEWER: "slate",
  RESTRICTED_VIEWER: "amber",
};

export const roleHue = (role: string): Hue => ROLE_HUE[role] ?? "slate";

export const roleLabel = (role: string): string =>
  role
    .toLowerCase()
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");

const DOMAIN_HUES: Hue[] = [
  "blue",
  "emerald",
  "orange",
  "violet",
  "teal",
  "rose",
  "amber",
];

/** Stable colour for a domain, so it matches everywhere it appears. */
export const domainHue = (domainId: number): Hue =>
  DOMAIN_HUES[Math.abs(domainId) % DOMAIN_HUES.length];
