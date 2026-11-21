"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  AlertCircle,
  ArrowLeft,
  Check,
  Download,
  GitCompareArrows,
  Info,
  Link2,
  Plus,
  X,
} from "lucide-react";
import { useCategoryIndex } from "@/components/catalog/use-category-index";
import { StatusBadge } from "@/components/catalog/status-badge";
import { PartPicker } from "@/components/compare/part-picker";
import { useCompare } from "@/components/compare/use-compare";
import { useSession } from "@/components/session-provider";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ApiError, apiRequest } from "@/lib/api";
import type { CatalogRecord } from "@/lib/catalog-types";
import { MAX_COMPARE, type CompareEntry } from "@/lib/compare-store";
import { HUE_DOT, domainHue } from "@/lib/highlights";

type Result =
  | { status: "ok"; part: CatalogRecord }
  | { status: "unavailable" }
  | { status: "error"; message: string };

interface RowDef {
  key: string;
  group: string;
  label: string;
  /** Plain text used to decide whether values differ. */
  value: (part: CatalogRecord, level: string) => string | undefined;
  render?: (part: CatalogRecord, level: string) => ReactNode;
}

const ROWS: RowDef[] = [
  {
    key: "status",
    group: "Overview",
    label: "Status",
    value: (part) => part.lifecycleStatus,
    render: (part) => <StatusBadge status={part.lifecycleStatus} />,
  },
  {
    key: "level",
    group: "Overview",
    label: "Level",
    value: (_p, level) => level,
  },
  {
    key: "description",
    group: "Overview",
    label: "Description",
    value: (part) => part.description,
    render: (part) => (
      <span className="line-clamp-4 text-sm text-muted-foreground">
        {part.description}
      </span>
    ),
  },
  {
    key: "material",
    group: "Specifications",
    label: "Material",
    value: (p) => p.material,
  },
  {
    key: "weight",
    group: "Specifications",
    label: "Weight",
    value: (p) => `${p.weightKg} kg`,
  },
  {
    key: "cost",
    group: "Specifications",
    label: "Cost",
    value: (p) => (p.costUsd === undefined ? undefined : `$${p.costUsd}`),
  },
  {
    key: "vehicle",
    group: "Fitment",
    label: "Vehicle program",
    value: (p) => p.vehicleProgram,
    render: (p) => (
      <Link
        href={`/vehicles/${encodeURIComponent(p.vehicleProgram)}`}
        className="text-hl-blue underline-offset-4 hover:underline"
      >
        {p.vehicleProgram}
      </Link>
    ),
  },
  {
    key: "year",
    group: "Fitment",
    label: "Model year",
    value: (p) => String(p.modelYear),
  },
  { key: "market", group: "Fitment", label: "Market", value: (p) => p.region },
  {
    key: "country",
    group: "Fitment",
    label: "Country",
    value: (p) => p.country,
  },
  {
    key: "maker",
    group: "Sourcing",
    label: "Manufacturer",
    value: (p) => p.manufacturer,
  },
  { key: "plant", group: "Sourcing", label: "Plant", value: (p) => p.plant },
  {
    key: "supplier",
    group: "Sourcing",
    label: "Supplier status",
    value: (p) => p.supplierStatus,
  },
  {
    key: "source",
    group: "Sourcing",
    label: "Source system",
    value: (p) => p.sourceSystem,
  },
  {
    key: "commodity",
    group: "Classification",
    label: "Commodity",
    value: (p) => p.commodity,
  },
  {
    key: "subcommodity",
    group: "Classification",
    label: "Sub-commodity",
    value: (p) => p.subCommodity,
  },
  {
    key: "version",
    group: "Record",
    label: "Version",
    value: (p) => String(p.version),
  },
];

/** The fields that matter when choosing between parts. The rest sit behind "All fields". */
const KEY_ROWS = new Set([
  "status",
  "level",
  "maker",
  "material",
  "weight",
  "cost",
  "vehicle",
  "year",
  "market",
]);

function parseIds(raw: string | null): number[] {
  const ids: number[] = [];
  for (const piece of (raw ?? "").split(",")) {
    const id = Number(piece.trim());
    if (Number.isInteger(id) && id > 0 && !ids.includes(id)) ids.push(id);
  }
  return ids.slice(0, MAX_COMPARE);
}

export function ComparePage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { has, orgVersion } = useSession();
  const { index } = useCategoryIndex();
  const compare = useCompare();
  const [onlyDifferences, setOnlyDifferences] = useState(false);
  const [allFields, setAllFields] = useState(false);
  const [adding, setAdding] = useState(false);
  const [copied, setCopied] = useState(false);

  const ids = useMemo(() => parseIds(searchParams.get("ids")), [searchParams]);
  const idsKey = ids.join(",");
  const key = `${orgVersion}:${idsKey}`;
  const [state, setState] = useState<{
    key: string;
    results: Record<number, Result>;
  } | null>(null);

  useEffect(() => {
    if (ids.length === 0) return;
    const controller = new AbortController();
    Promise.all(
      ids.map(async (id): Promise<[number, Result]> => {
        try {
          const part = await apiRequest<CatalogRecord>(`/catalog/parts/${id}`, {
            signal: controller.signal,
          });
          return [id, { status: "ok", part }];
        } catch (failure) {
          if (failure instanceof ApiError && failure.status === 404) {
            return [id, { status: "unavailable" }];
          }
          return [
            id,
            {
              status: "error",
              message:
                failure instanceof Error
                  ? failure.message
                  : "The part could not be loaded.",
            },
          ];
        }
      }),
    ).then((entries) => {
      if (controller.signal.aborted) return;
      setState({ key, results: Object.fromEntries(entries) });
    });
    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const current = state?.key === key ? state : null;
  const loading = ids.length > 0 && !current;

  const columns = ids.map((id) => ({
    id,
    result: current?.results[id] ?? null,
  }));
  const available = columns.flatMap((column) =>
    column.result?.status === "ok" ? [column.result.part] : [],
  );
  const levelOf = (part: CatalogRecord) =>
    index
      .get(part.primaryCategoryId)
      ?.trail.map((node) => node.name)
      .join(" › ") ?? "";

  const rows = useMemo(() => {
    return ROWS.map((row) => {
      const values = available.map((part) => row.value(part, levelOf(part)));
      const shown = values.some((value) => value !== undefined);
      const differs = new Set(values.map((value) => value ?? "—")).size > 1;
      return { row, shown, differs };
    }).filter(
      (entry) => entry.shown && (allFields || KEY_ROWS.has(entry.row.key)),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [available.length, current, index, allFields]);

  const visibleRows = onlyDifferences
    ? rows.filter((entry) => entry.differs)
    : rows;
  const differenceCount = rows.filter((entry) => entry.differs).length;

  const domainIds = new Set(
    available
      .map((part) => index.get(part.primaryCategoryId)?.domain?.id)
      .filter((id): id is number => id !== undefined),
  );
  const mixedLevels = domainIds.size > 1;

  function addPart(entry: CompareEntry) {
    if (ids.includes(entry.id) || ids.length >= MAX_COMPARE) return;
    if (!compare.has(entry.id)) compare.toggle(entry);
    router.replace(`/compare?ids=${[...ids, entry.id].join(",")}`);
  }

  function removeColumn(id: number) {
    compare.remove(id);
    const next = ids.filter((entry) => entry !== id);
    router.replace(next.length ? `/compare?ids=${next.join(",")}` : "/compare");
  }

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // Clipboard can be blocked; nothing else to do.
    }
  }

  // Group rows for section headers.
  const grouped: Array<{ group: string; entries: typeof visibleRows }> = [];
  for (const entry of visibleRows) {
    const last = grouped[grouped.length - 1];
    if (last && last.group === entry.row.group) last.entries.push(entry);
    else grouped.push({ group: entry.row.group, entries: [entry] });
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-7xl space-y-5 p-4 sm:p-6">
        <Link
          href="/catalog"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" aria-hidden /> Catalog
        </Link>

        <header className="flex flex-wrap items-end justify-between gap-4">
          <div className="space-y-1">
            <p className="font-mono text-[11px] tracking-wide text-muted-foreground uppercase">
              Compare parts
            </p>
            <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
              {ids.length > 0
                ? `${ids.length} part${ids.length === 1 ? "" : "s"} side by side`
                : "Nothing to compare yet"}
            </h1>
            {current && available.length > 1 ? (
              <p className="text-sm text-muted-foreground">
                {differenceCount === 0
                  ? "These parts match on every shown field."
                  : `${differenceCount} field${differenceCount === 1 ? "" : "s"} differ.`}
              </p>
            ) : null}
          </div>

          {ids.length > 0 ? (
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                role="switch"
                aria-checked={onlyDifferences}
                onClick={() => setOnlyDifferences((value) => !value)}
                className="inline-flex items-center gap-2 rounded-lg border px-3 py-1.5 text-sm"
              >
                <span
                  aria-hidden
                  className={`flex h-4 w-7 items-center rounded-full p-0.5 transition-colors ${
                    onlyDifferences ? "bg-hl-blue" : "bg-input"
                  }`}
                >
                  <span
                    className={`size-3 rounded-full bg-background transition-transform ${
                      onlyDifferences ? "translate-x-3" : ""
                    }`}
                  />
                </span>
                Only differences
              </button>
              <button
                type="button"
                role="switch"
                aria-checked={allFields}
                onClick={() => setAllFields((value) => !value)}
                className="inline-flex items-center gap-2 rounded-lg border px-3 py-1.5 text-sm"
              >
                <span
                  aria-hidden
                  className={`flex h-4 w-7 items-center rounded-full p-0.5 transition-colors ${
                    allFields ? "bg-hl-blue" : "bg-input"
                  }`}
                >
                  <span
                    className={`size-3 rounded-full bg-background transition-transform ${
                      allFields ? "translate-x-3" : ""
                    }`}
                  />
                </span>
                All fields
              </button>
              {ids.length < MAX_COMPARE ? (
                <Button
                  variant={adding ? "secondary" : "outline"}
                  aria-expanded={adding}
                  onClick={() => setAdding((value) => !value)}
                >
                  <Plus /> Add parts
                </Button>
              ) : null}
              <Button variant="outline" onClick={copyLink}>
                {copied ? <Check /> : <Link2 />}
                {copied ? "Copied" : "Copy link"}
              </Button>
              {has("catalog.export") ? (
                <Button variant="outline" disabled>
                  <Download /> Export · soon
                </Button>
              ) : null}
            </div>
          ) : null}
        </header>

        {mixedLevels ? (
          <div
            role="note"
            className="flex items-start gap-2 rounded-lg border border-hl-amber/30 bg-hl-amber/10 px-3 py-2 text-sm"
          >
            <Info
              className="mt-0.5 size-4 shrink-0 text-hl-amber"
              aria-hidden
            />
            These parts are from different levels, so some rows may not be
            comparable.
          </div>
        ) : null}

        {ids.length === 0 ? (
          <div className="flex flex-col items-center gap-4 rounded-xl border px-6 py-16 text-center">
            <GitCompareArrows
              className="size-9 text-muted-foreground"
              aria-hidden
            />
            <div className="space-y-1">
              <p className="font-medium">
                Pick 2 to {MAX_COMPARE} parts to compare
              </p>
              <p className="text-sm text-muted-foreground">
                Search for parts right here, or tick them in the catalog.
              </p>
            </div>
            <PartPicker
              selectedIds={ids}
              full={ids.length >= MAX_COMPARE}
              max={MAX_COMPARE}
              onAdd={addPart}
              autoFocus
            />
            <div className="flex flex-wrap justify-center gap-2">
              <Button
                variant="outline"
                nativeButton={false}
                render={<Link href="/catalog" />}
              >
                Browse the catalog
              </Button>
              {compare.count > 0 ? (
                <Button
                  variant="outline"
                  nativeButton={false}
                  render={
                    <Link
                      href={`/compare?ids=${compare.items.map((item) => item.id).join(",")}`}
                    />
                  }
                >
                  Compare my {compare.count} selected
                </Button>
              ) : null}
            </div>
          </div>
        ) : loading ? (
          <div className="space-y-3" aria-label="Loading parts">
            <Skeleton className="h-28 w-full" />
            <Skeleton className="h-64 w-full" />
          </div>
        ) : (
          <>
            {adding && ids.length < MAX_COMPARE ? (
              <div className="rounded-xl border p-4">
                <PartPicker
                  selectedIds={ids}
                  full={ids.length >= MAX_COMPARE}
                  max={MAX_COMPARE}
                  onAdd={addPart}
                  autoFocus
                />
              </div>
            ) : null}
            {available.length < 2 ? (
              <div
                role="note"
                className="flex items-start gap-2 rounded-lg border px-3 py-2 text-sm text-muted-foreground"
              >
                <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden />
                {ids.length < 2
                  ? "Add at least one more part to compare."
                  : "Fewer than two of these parts are available to you, so there is nothing to compare."}
              </div>
            ) : null}

            <div className="overflow-x-auto rounded-xl border">
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="border-b align-top">
                    <th className="sticky left-0 z-10 w-28 min-w-28 bg-background p-3 sm:w-44 sm:min-w-44" />
                    {columns.map(({ id, result }) => {
                      const part = result?.status === "ok" ? result.part : null;
                      const info = part
                        ? index.get(part.primaryCategoryId)
                        : undefined;
                      return (
                        <th
                          key={id}
                          className="min-w-60 border-l p-3 text-left font-normal"
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0 space-y-1.5">
                              {part ? (
                                <>
                                  <Link
                                    href={`/catalog/${part.id}`}
                                    className="font-mono text-xs text-hl-blue underline-offset-4 hover:underline"
                                  >
                                    {part.partNumber}
                                  </Link>
                                  <p className="font-medium leading-snug">
                                    {part.partName}
                                  </p>
                                  {info?.domain ? (
                                    <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                                      <span
                                        aria-hidden
                                        className={`size-2 rounded-full ${HUE_DOT[domainHue(info.domain.id)]}`}
                                      />
                                      {info.domain.name}
                                    </p>
                                  ) : null}
                                </>
                              ) : result?.status === "unavailable" ? (
                                <>
                                  <p className="font-mono text-xs text-muted-foreground">
                                    #{id}
                                  </p>
                                  <p className="text-sm text-muted-foreground">
                                    Not available in this organization
                                  </p>
                                </>
                              ) : (
                                <>
                                  <p className="font-mono text-xs text-muted-foreground">
                                    #{id}
                                  </p>
                                  <p className="text-sm text-destructive">
                                    {result?.status === "error"
                                      ? result.message
                                      : "Loading…"}
                                  </p>
                                </>
                              )}
                            </div>
                            <button
                              type="button"
                              onClick={() => removeColumn(id)}
                              aria-label={`Remove ${part?.partNumber ?? `part ${id}`} from comparison`}
                              className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                            >
                              <X className="size-4" aria-hidden />
                            </button>
                          </div>
                        </th>
                      );
                    })}
                  </tr>
                </thead>
                <tbody>
                  {grouped.map(({ group, entries }) => (
                    <GroupRows
                      key={group}
                      group={group}
                      entries={entries}
                      columns={columns}
                      columnCount={columns.length}
                      levelOf={levelOf}
                    />
                  ))}
                  {visibleRows.length === 0 && available.length > 0 ? (
                    <tr>
                      <td
                        colSpan={columns.length + 1}
                        className="p-8 text-center text-sm text-muted-foreground"
                      >
                        No differences. These parts match on every shown field.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>

            <p className="text-xs text-muted-foreground">
              Only fields your role can see are shown. Parts outside your
              organization appear as not available.
            </p>
          </>
        )}
      </div>
    </div>
  );
}

function GroupRows({
  group,
  entries,
  columns,
  columnCount,
  levelOf,
}: {
  group: string;
  entries: Array<{ row: RowDef; differs: boolean }>;
  columns: Array<{ id: number; result: Result | null }>;
  columnCount: number;
  levelOf: (part: CatalogRecord) => string;
}) {
  return (
    <>
      <tr className="bg-secondary/50">
        <th
          colSpan={columnCount + 1}
          className="sticky left-0 px-3 py-1.5 text-left font-mono text-[10px] font-normal tracking-wide text-muted-foreground uppercase"
        >
          {group}
        </th>
      </tr>
      {entries.map(({ row, differs }) => (
        <tr key={row.key} className="border-t">
          <th
            scope="row"
            className="sticky left-0 z-10 bg-background p-3 text-left align-top text-sm font-normal text-muted-foreground"
          >
            {row.label}
          </th>
          {columns.map(({ id, result }) => {
            const part = result?.status === "ok" ? result.part : null;
            const text = part ? row.value(part, levelOf(part)) : undefined;
            return (
              <td
                key={id}
                className={`border-l p-3 align-top ${
                  differs && part ? "bg-hl-amber/10" : ""
                }`}
              >
                {part && text !== undefined ? (
                  row.render ? (
                    row.render(part, levelOf(part))
                  ) : (
                    <span>{text}</span>
                  )
                ) : (
                  <span className="text-muted-foreground/60">—</span>
                )}
              </td>
            );
          })}
        </tr>
      ))}
    </>
  );
}
