"use client";

import { useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  ChevronRight,
  Download,
  Layers,
  Loader2,
  Plus,
  Search,
  SearchX,
  X,
} from "lucide-react";
import { useSession } from "@/components/session-provider";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { apiRequest, apiRequestFull } from "@/lib/api";
import {
  LIFECYCLE_STATUSES,
  REGIONS,
  type CategoryNode,
  type SearchItem,
  type SearchMeta,
  type SearchRequest,
  type SortField,
} from "@/lib/catalog-types";
import { HUE_DOT, domainHue } from "@/lib/highlights";
import {
  buildCategoryIndex,
  collectIds,
  computeAllowedIds,
  visibleRoots,
  type EntitlementEntry,
} from "./category-utils";
import { LevelsTree } from "./levels-tree";
import { PartDrawer } from "./part-drawer";
import { StatusBadge } from "./status-badge";

const PAGE_SIZE = 25;
const ALL = "all";

type SortKey =
  | "relevance"
  | "partNumber:asc"
  | "partNumber:desc"
  | "updatedAt:desc"
  | "modelYear:desc";

const SORT_LABELS: Record<SortKey, string> = {
  relevance: "Best match",
  "partNumber:asc": "Part number A–Z",
  "partNumber:desc": "Part number Z–A",
  "updatedAt:desc": "Recently updated",
  "modelYear:desc": "Newest model year",
};

function useDebounced<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);
  return debounced;
}

function parseYear(value: string): number | undefined {
  const year = Number(value);
  return Number.isInteger(year) && year >= 1886 && year <= 2100
    ? year
    : undefined;
}

export function CatalogView() {
  const { profile, has, orgVersion } = useSession();

  // Levels (keyed by organization so a switch never shows stale levels)
  const [treeReload, setTreeReload] = useState(0);
  const treeKey = `${orgVersion}:${treeReload}`;
  const [treeState, setTreeState] = useState<{
    key: string;
    tree: CategoryNode[];
    error: string;
  } | null>(null);
  const [selection, setSelection] = useState<{
    org: number;
    node: CategoryNode | null;
  }>({ org: 0, node: null });
  const [levelsOpen, setLevelsOpen] = useState(false);
  const selectedNode = selection.org === orgVersion ? selection.node : null;
  const setSelectedNode = (node: CategoryNode | null) =>
    setSelection({ org: orgVersion, node });

  // Search controls
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState(ALL);
  const [region, setRegion] = useState(ALL);
  const [yearFrom, setYearFrom] = useState("");
  const [yearTo, setYearTo] = useState("");
  const [sortKey, setSortKey] = useState<SortKey | null>(null);

  // Results
  const [result, setResult] = useState<{
    key: string;
    items: SearchItem[];
    meta: SearchMeta | null;
    error: string;
  } | null>(null);
  const [slowKey, setSlowKey] = useState("");
  const [loadingMore, setLoadingMore] = useState(false);
  const [moreError, setMoreError] = useState("");
  const [reload, setReload] = useState(0);
  const [openPartId, setOpenPartId] = useState<number | null>(null);

  // Admins can read entitlements, which lets us lock levels their active
  // organization does not include. Other roles already get a limited tree.
  const canReadEntitlements = has("organization.entitlements.read");
  const organizationId = profile.activeContext?.organizationId ?? "";
  const [entitlementState, setEntitlementState] = useState<{
    key: string;
    entries: EntitlementEntry[];
  } | null>(null);
  const entitlementKey = `${orgVersion}:${organizationId}`;

  useEffect(() => {
    if (!canReadEntitlements || !organizationId) return;
    const controller = new AbortController();
    apiRequest<{ entries: EntitlementEntry[] }>(
      `/organizations/${organizationId}/entitlements`,
      { signal: controller.signal },
    )
      .then((set) =>
        setEntitlementState({ key: entitlementKey, entries: set.entries }),
      )
      .catch(() => {
        // Without entitlements nothing is locked; the API still enforces access.
      });
    return () => controller.abort();
  }, [canReadEntitlements, organizationId, entitlementKey]);

  const treeCurrent = treeState?.key === treeKey ? treeState : null;
  const treeLoading = !treeCurrent;
  const treeError = treeCurrent?.error ?? "";
  const roots = useMemo(
    () => visibleRoots(treeCurrent?.tree ?? []),
    [treeCurrent],
  );
  const index = useMemo(() => buildCategoryIndex(roots), [roots]);
  const allowedIds = useMemo(() => {
    if (!canReadEntitlements || entitlementState?.key !== entitlementKey) {
      return null;
    }
    const allowed = computeAllowedIds(entitlementState.entries, index);
    // Everything not allowed is locked; build the set of allowed ids to test.
    return allowed;
  }, [canReadEntitlements, entitlementState, entitlementKey, index]);

  const debounced = {
    query: useDebounced(query.trim(), 400),
    yearFrom: useDebounced(yearFrom, 400),
    yearTo: useDebounced(yearTo, 400),
  };
  const effectiveSort: SortKey =
    sortKey ?? (debounced.query ? "relevance" : "partNumber:asc");
  const sortOptions = (Object.keys(SORT_LABELS) as SortKey[]).filter(
    (key) => key !== "relevance" || debounced.query !== "",
  );

  // Load the levels for the active organization.
  useEffect(() => {
    const controller = new AbortController();
    apiRequest<CategoryNode[]>("/categories/tree", {
      signal: controller.signal,
    })
      .then((loaded) => setTreeState({ key: treeKey, tree: loaded, error: "" }))
      .catch((failure) => {
        if (controller.signal.aborted) return;
        setTreeState({
          key: treeKey,
          tree: [],
          error:
            failure instanceof Error
              ? failure.message
              : "Levels failed to load.",
        });
      });
    return () => controller.abort();
  }, [treeKey]);

  const request = useMemo((): SearchRequest => {
    const filters: NonNullable<SearchRequest["filters"]> = {};
    if (selectedNode) {
      if (selectedNode.isSecurityDomain) {
        filters.securityDomainIds = [selectedNode.id];
      } else {
        filters.primaryCategoryIds = collectIds(selectedNode).slice(0, 100);
      }
    }
    if (status !== ALL) filters.lifecycleStatuses = [status];
    if (region !== ALL) filters.regions = [region];
    const from = parseYear(debounced.yearFrom);
    const to = parseYear(debounced.yearTo);
    if (from || to) filters.modelYears = { from, to };

    const [field, direction] = effectiveSort.split(":") as [
      SortField,
      "asc" | "desc" | undefined,
    ];
    return {
      query: debounced.query,
      filters,
      facets: [],
      sort: { field, direction: direction ?? "desc" },
      limit: PAGE_SIZE,
    };
  }, [
    selectedNode,
    status,
    region,
    debounced.query,
    debounced.yearFrom,
    debounced.yearTo,
    effectiveSort,
  ]);

  const searchKey = `${orgVersion}:${reload}:${JSON.stringify(request)}`;
  const loading = result?.key !== searchKey;
  const slow = loading && slowKey === searchKey;
  const items = result?.items ?? [];
  const meta = result?.meta ?? null;
  const error = loading ? "" : (result?.error ?? "");

  // Run the search whenever the controls change; older requests are cancelled.
  useEffect(() => {
    const controller = new AbortController();
    const slowTimer = setTimeout(() => setSlowKey(searchKey), 1500);

    apiRequestFull<{ items: SearchItem[] }, SearchMeta>("/search", {
      method: "POST",
      body: request,
      signal: controller.signal,
    })
      .then((response) =>
        setResult({
          key: searchKey,
          items: response.data.items,
          meta: response.meta,
          error: "",
        }),
      )
      .catch((failure) => {
        if (controller.signal.aborted) return;
        setResult({
          key: searchKey,
          items: [],
          meta: null,
          error:
            failure instanceof Error
              ? failure.message
              : "The catalog could not be searched.",
        });
      })
      .finally(() => clearTimeout(slowTimer));

    return () => {
      clearTimeout(slowTimer);
      controller.abort();
    };
  }, [searchKey, request]);

  async function loadMore() {
    if (!meta?.nextCursor || loadingMore || loading) return;
    setLoadingMore(true);
    setMoreError("");
    try {
      const response = await apiRequestFull<
        { items: SearchItem[] },
        SearchMeta
      >("/search", {
        method: "POST",
        body: { ...request, cursor: meta.nextCursor },
      });
      setResult((current) =>
        current && current.key === searchKey
          ? {
              ...current,
              items: [...current.items, ...response.data.items],
              meta: response.meta,
            }
          : current,
      );
    } catch (failure) {
      setMoreError(
        failure instanceof Error
          ? failure.message
          : "Couldn't load more parts.",
      );
    } finally {
      setLoadingMore(false);
    }
  }

  const activeChips: Array<{ key: string; label: string; clear: () => void }> =
    [];
  if (status !== ALL)
    activeChips.push({
      key: "status",
      label: `Status: ${status}`,
      clear: () => setStatus(ALL),
    });
  if (region !== ALL)
    activeChips.push({
      key: "region",
      label: `Region: ${region}`,
      clear: () => setRegion(ALL),
    });
  if (yearFrom || yearTo)
    activeChips.push({
      key: "year",
      label: `Year: ${yearFrom || "…"}–${yearTo || "…"}`,
      clear: () => {
        setYearFrom("");
        setYearTo("");
      },
    });

  function clearAll() {
    setStatus(ALL);
    setRegion(ALL);
    setYearFrom("");
    setYearTo("");
    setSelectedNode(null);
    setQuery("");
    setSortKey(null);
  }

  const selectedInfo = selectedNode ? index.get(selectedNode.id) : undefined;
  const hasConstraints =
    activeChips.length > 0 || selectedNode !== null || query.trim() !== "";
  const orgName =
    profile.activeContext?.organizationName ?? "your organization";

  const tree_ = (
    <LevelsTree
      roots={roots}
      index={index}
      selectedId={selectedNode?.id ?? null}
      loading={treeLoading}
      error={treeError}
      allowedIds={allowedIds}
      onSelect={(node) => {
        setSelectedNode(node);
        setLevelsOpen(false);
      }}
      onRetry={() => setTreeReload((value) => value + 1)}
    />
  );

  return (
    <div className="flex h-full">
      <aside className="hidden w-72 shrink-0 border-r lg:block">{tree_}</aside>

      <section className="flex min-w-0 flex-1 flex-col">
        <div className="space-y-3 border-b p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <nav
              aria-label="Breadcrumb"
              className="flex min-w-0 flex-wrap items-center gap-1 text-sm"
            >
              <button
                type="button"
                onClick={() => setSelectedNode(null)}
                className={
                  selectedNode
                    ? "text-muted-foreground hover:text-foreground"
                    : "font-medium"
                }
              >
                Catalog
              </button>
              {selectedInfo?.trail.map((level, position) => {
                const last = position === selectedInfo.trail.length - 1;
                return (
                  <span key={level.id} className="flex items-center gap-1">
                    <ChevronRight
                      className="size-3.5 text-muted-foreground"
                      aria-hidden
                    />
                    {position === 0 ? (
                      <span
                        aria-hidden
                        className={`size-2 rounded-full ${HUE_DOT[domainHue(selectedInfo.trail[0].id)]}`}
                      />
                    ) : null}
                    <button
                      type="button"
                      onClick={() => setSelectedNode(level)}
                      className={
                        last
                          ? "font-medium"
                          : "text-muted-foreground hover:text-foreground"
                      }
                    >
                      {level.name}
                    </button>
                  </span>
                );
              })}
            </nav>
            <div className="flex items-center gap-2">
              {has("catalog.export") ? (
                <Button variant="outline" size="sm" disabled>
                  <Download /> Export · soon
                </Button>
              ) : null}
              {has("catalog.create") ? (
                <Button size="sm" disabled>
                  <Plus /> Add part · soon
                </Button>
              ) : null}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              className="lg:hidden"
              onClick={() => setLevelsOpen(true)}
            >
              <Layers /> Levels
            </Button>
            <div className="relative min-w-[12rem] flex-1">
              <Search
                className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
                aria-hidden
              />
              <Input
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search part number, name, material, maker…"
                aria-label="Search parts"
                className="h-10 pl-9"
              />
            </div>
            <Select
              value={effectiveSort}
              onValueChange={(value) => setSortKey(value as SortKey)}
            >
              <SelectTrigger className="w-48" aria-label="Sort results">
                <SelectValue>
                  {(value) => SORT_LABELS[value as SortKey]}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {sortOptions.map((key) => (
                  <SelectItem key={key} value={key}>
                    {SORT_LABELS[key]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Select
              value={status}
              onValueChange={(value) => setStatus(String(value))}
            >
              <SelectTrigger className="w-40" aria-label="Filter by status">
                <SelectValue>
                  {(value) => (value === ALL ? "Any status" : String(value))}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>Any status</SelectItem>
                {LIFECYCLE_STATUSES.map((entry) => (
                  <SelectItem key={entry} value={entry}>
                    {entry}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select
              value={region}
              onValueChange={(value) => setRegion(String(value))}
            >
              <SelectTrigger className="w-44" aria-label="Filter by region">
                <SelectValue>
                  {(value) => (value === ALL ? "Any region" : String(value))}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>Any region</SelectItem>
                {REGIONS.map((entry) => (
                  <SelectItem key={entry} value={entry}>
                    {entry}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input
              inputMode="numeric"
              placeholder="Year from"
              aria-label="Model year from"
              className="w-28"
              value={yearFrom}
              onChange={(event) =>
                setYearFrom(event.target.value.replace(/\D/g, "").slice(0, 4))
              }
            />
            <Input
              inputMode="numeric"
              placeholder="Year to"
              aria-label="Model year to"
              className="w-28"
              value={yearTo}
              onChange={(event) =>
                setYearTo(event.target.value.replace(/\D/g, "").slice(0, 4))
              }
            />
            {hasConstraints ? (
              <Button variant="ghost" size="sm" onClick={clearAll}>
                Clear all
              </Button>
            ) : null}
          </div>

          {activeChips.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {activeChips.map((chip) => (
                <button
                  key={chip.key}
                  type="button"
                  onClick={chip.clear}
                  className="inline-flex items-center gap-1.5 rounded-full border border-hl-blue/25 bg-hl-blue/10 px-2.5 py-0.5 text-xs text-hl-blue"
                >
                  {chip.label}
                  <X className="size-3" aria-label={`Remove ${chip.label}`} />
                </button>
              ))}
            </div>
          ) : null}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">
          <div className="flex items-center justify-between gap-3 px-4 py-3 text-sm text-muted-foreground">
            <span aria-live="polite">
              {loading
                ? slow
                  ? `Searching ${orgName}'s records… this can take a few seconds`
                  : "Searching…"
                : meta
                  ? `${meta.visibleHitCount.toLocaleString()} parts · ${(meta.queryTimeMs / 1000).toFixed(1)}s`
                  : ""}
            </span>
            {loading ? (
              <Loader2 className="size-4 animate-spin" aria-hidden />
            ) : null}
          </div>

          {error ? (
            <div className="px-4">
              <Alert variant="destructive" role="alert">
                <AlertCircle />
                <AlertTitle>The catalog couldn&apos;t be loaded</AlertTitle>
                <AlertDescription className="space-y-2">
                  <span>{error}</span>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setReload((value) => value + 1)}
                  >
                    Try again
                  </Button>
                </AlertDescription>
              </Alert>
            </div>
          ) : loading && items.length === 0 ? (
            <div className="space-y-2 px-4" aria-label="Loading parts">
              {Array.from({ length: 8 }).map((_, row) => (
                <Skeleton key={row} className="h-12 w-full" />
              ))}
            </div>
          ) : !loading && items.length === 0 ? (
            <div className="flex flex-col items-center gap-3 px-4 py-16 text-center">
              <SearchX className="size-8 text-muted-foreground" aria-hidden />
              <div>
                <p className="font-medium">No parts match</p>
                <p className="text-sm text-muted-foreground">
                  Try a different search, level or filter.
                </p>
              </div>
              {hasConstraints ? (
                <Button variant="outline" onClick={clearAll}>
                  Clear filters
                </Button>
              ) : null}
            </div>
          ) : (
            <div className={loading ? "opacity-60 transition-opacity" : ""}>
              <div className="hidden md:block">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="pl-4">Part number</TableHead>
                      <TableHead>Part</TableHead>
                      <TableHead>Level</TableHead>
                      <TableHead>Maker</TableHead>
                      <TableHead>Region</TableHead>
                      <TableHead className="text-right">Year</TableHead>
                      <TableHead className="pr-4">Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {items.map((item) => {
                      const info = index.get(item.primaryCategoryId);
                      return (
                        <TableRow
                          key={item.id}
                          className="cursor-pointer"
                          onClick={() => setOpenPartId(item.id)}
                        >
                          <TableCell className="pl-4 font-mono text-xs">
                            <button
                              type="button"
                              className="text-hl-blue underline-offset-4 hover:underline"
                              onClick={(event) => {
                                event.stopPropagation();
                                setOpenPartId(item.id);
                              }}
                            >
                              {item.partNumber}
                            </button>
                          </TableCell>
                          <TableCell className="max-w-xs">
                            <p className="truncate font-medium">
                              {item.partName}
                            </p>
                            <p className="truncate text-xs text-muted-foreground">
                              {item.material}
                            </p>
                          </TableCell>
                          <TableCell>
                            <span className="flex items-center gap-2 text-sm">
                              <span
                                aria-hidden
                                className={`size-2 shrink-0 rounded-full ${
                                  info?.domain
                                    ? HUE_DOT[domainHue(info.domain.id)]
                                    : "bg-border"
                                }`}
                              />
                              {info?.node.name ?? "—"}
                            </span>
                          </TableCell>
                          <TableCell className="text-sm">
                            {item.manufacturer}
                          </TableCell>
                          <TableCell className="text-sm">
                            {item.region}
                          </TableCell>
                          <TableCell className="text-right font-mono text-xs tabular-nums">
                            {item.modelYear}
                          </TableCell>
                          <TableCell className="pr-4">
                            <StatusBadge status={item.lifecycleStatus} />
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>

              <ul className="divide-y md:hidden">
                {items.map((item) => (
                  <li key={item.id}>
                    <button
                      type="button"
                      onClick={() => setOpenPartId(item.id)}
                      className="w-full space-y-1.5 px-4 py-3 text-left"
                    >
                      <span className="flex items-center justify-between gap-2">
                        <span className="font-mono text-xs text-hl-blue">
                          {item.partNumber}
                        </span>
                        <StatusBadge status={item.lifecycleStatus} />
                      </span>
                      <span className="block font-medium">{item.partName}</span>
                      <span className="block text-xs text-muted-foreground">
                        {item.manufacturer} · {item.region} · {item.modelYear}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>

              {moreError ? (
                <p
                  className="px-4 pt-3 text-center text-sm text-destructive"
                  role="alert"
                >
                  {moreError}
                </p>
              ) : null}
              {meta?.nextCursor ? (
                <div className="flex justify-center p-4">
                  <Button
                    variant="outline"
                    onClick={loadMore}
                    disabled={loadingMore}
                  >
                    {loadingMore ? <Loader2 className="animate-spin" /> : null}
                    {loadingMore ? "Loading" : "Load more"}
                  </Button>
                </div>
              ) : items.length > 0 ? (
                <p className="p-4 text-center text-xs text-muted-foreground">
                  End of results
                </p>
              ) : null}
            </div>
          )}
        </div>
      </section>

      <Sheet open={levelsOpen} onOpenChange={setLevelsOpen}>
        <SheetContent side="left" className="w-72 p-0">
          <SheetHeader className="sr-only">
            <SheetTitle>Levels</SheetTitle>
          </SheetHeader>
          {tree_}
        </SheetContent>
      </Sheet>

      <PartDrawer
        partId={openPartId}
        index={index}
        onClose={() => setOpenPartId(null)}
      />
    </div>
  );
}
