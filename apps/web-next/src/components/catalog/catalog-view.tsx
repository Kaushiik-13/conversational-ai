"use client";

import { useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  Download,
  Loader2,
  Plus,
  Search,
  SearchX,
  SlidersHorizontal,
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
  FACET_LABELS,
  FACET_NAMES,
  type CategoryNode,
  type FacetBucket,
  type FacetName,
  type SearchFilters,
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
import { FacetPanel, type FacetState, type Picked } from "./facet-panel";
import { LevelsBar } from "./levels-bar";
import { PartDrawer } from "./part-drawer";
import { StatusBadge } from "./status-badge";

const PAGE_SIZE = 25;

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

const FILTER_KEY: Record<FacetName, keyof SearchFilters> = {
  manufacturer: "manufacturerNames",
  region: "regions",
  material: "materials",
  lifecycleStatus: "lifecycleStatuses",
};

const EMPTY_PICKED: Picked = {
  manufacturer: [],
  region: [],
  material: [],
  lifecycleStatus: [],
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

/**
 * Counts for one filter group. Each group loads on its own so the results
 * table never waits for counts. The API ignores a group's own filter when
 * counting it, so ticking several values in one group keeps showing the others.
 */
function useFacet(
  name: FacetName,
  query: string,
  filtersJson: string,
  scope: string,
  enabled: boolean,
): FacetState {
  const [reload, setReload] = useState(0);
  const key = `${scope}:${reload}:${query}:${filtersJson}`;
  const [state, setState] = useState<{
    key: string;
    buckets: FacetBucket[];
    error: boolean;
  } | null>(null);

  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();
    apiRequestFull<{ facets: Partial<Record<FacetName, FacetBucket[]>> }>(
      "/search",
      {
        method: "POST",
        signal: controller.signal,
        body: {
          query,
          filters: JSON.parse(filtersJson) as SearchFilters,
          facets: [name],
          sort: { field: "partNumber", direction: "asc" },
          limit: 1,
        },
      },
    )
      .then((response) =>
        setState({
          key,
          buckets: response.data.facets?.[name] ?? [],
          error: false,
        }),
      )
      .catch(() => {
        if (controller.signal.aborted) return;
        setState((current) => ({
          key,
          buckets: current?.buckets ?? [],
          error: true,
        }));
      });
    return () => controller.abort();
  }, [key, name, query, filtersJson, enabled]);

  return {
    buckets: state?.buckets ?? null,
    loading: state?.key !== key,
    error: state?.key === key && state.error,
    retry: () => setReload((value) => value + 1),
  };
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
  const [filtersOpen, setFiltersOpen] = useState(false);
  const selectedNode = selection.org === orgVersion ? selection.node : null;
  const setSelectedNode = (node: CategoryNode | null) =>
    setSelection({ org: orgVersion, node });

  // Search controls
  const [query, setQuery] = useState("");
  const [pickedState, setPickedState] = useState<{
    org: number;
    value: Picked;
  }>({ org: 0, value: EMPTY_PICKED });
  const picked =
    pickedState.org === orgVersion ? pickedState.value : EMPTY_PICKED;
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

  const treeCurrent = treeState?.key === treeKey ? treeState : null;
  const treeLoading = !treeCurrent;
  const treeError = treeCurrent?.error ?? "";
  const roots = useMemo(
    () => visibleRoots(treeCurrent?.tree ?? []),
    [treeCurrent],
  );
  const index = useMemo(() => buildCategoryIndex(roots), [roots]);
  // Entitlements can be granted on the hidden top level, so resolve them
  // against the full tree.
  const fullIndex = useMemo(
    () => buildCategoryIndex(treeCurrent?.tree ?? []),
    [treeCurrent],
  );

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

  const allowedIds = useMemo(() => {
    if (!canReadEntitlements || entitlementState?.key !== entitlementKey) {
      return null;
    }
    return computeAllowedIds(entitlementState.entries, fullIndex);
  }, [canReadEntitlements, entitlementState, entitlementKey, fullIndex]);

  const debouncedQuery = useDebounced(query.trim(), 400);
  const debouncedYearFrom = useDebounced(yearFrom, 400);
  const debouncedYearTo = useDebounced(yearTo, 400);
  const effectiveSort: SortKey =
    sortKey ?? (debouncedQuery ? "relevance" : "partNumber:asc");
  const sortOptions = (Object.keys(SORT_LABELS) as SortKey[]).filter(
    (key) => key !== "relevance" || debouncedQuery !== "",
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

  // Filters shared by the results and every filter group.
  const baseFilters = useMemo((): SearchFilters => {
    const filters: SearchFilters = {};
    if (selectedNode) {
      if (selectedNode.isSecurityDomain) {
        filters.securityDomainIds = [selectedNode.id];
      } else {
        filters.primaryCategoryIds = collectIds(selectedNode).slice(0, 100);
      }
    }
    const from = parseYear(debouncedYearFrom);
    const to = parseYear(debouncedYearTo);
    if (from || to) filters.modelYears = { from, to };
    return filters;
  }, [selectedNode, debouncedYearFrom, debouncedYearTo]);

  const filtersWith = (skip: FacetName | null): SearchFilters => {
    const filters: SearchFilters = { ...baseFilters };
    for (const name of FACET_NAMES) {
      if (name === skip || picked[name].length === 0) continue;
      (filters as Record<string, unknown>)[FILTER_KEY[name]] = picked[name];
    }
    return filters;
  };

  const request = useMemo((): SearchRequest => {
    const filters: SearchFilters = { ...baseFilters };
    for (const name of FACET_NAMES) {
      if (picked[name].length === 0) continue;
      (filters as Record<string, unknown>)[FILTER_KEY[name]] = picked[name];
    }
    const [field, direction] = effectiveSort.split(":") as [
      SortField,
      "asc" | "desc" | undefined,
    ];
    return {
      query: debouncedQuery,
      filters,
      facets: [],
      sort: { field, direction: direction ?? "desc" },
      limit: PAGE_SIZE,
    };
  }, [baseFilters, picked, debouncedQuery, effectiveSort]);

  const searchKey = `${orgVersion}:${reload}:${JSON.stringify(request)}`;
  const loading = result?.key !== searchKey;
  const slow = loading && slowKey === searchKey;
  const items = result?.items ?? [];
  const meta = result?.meta ?? null;
  const error = loading ? "" : (result?.error ?? "");

  // One counts request per filter group (each skips its own filter).
  const facetScope = String(orgVersion);
  // Counts start only after the table has loaded so they never slow it down.
  const facetsEnabled = !loading;
  const facets: Record<FacetName, FacetState> = {
    manufacturer: useFacet(
      "manufacturer",
      debouncedQuery,
      JSON.stringify(filtersWith("manufacturer")),
      facetScope,
      facetsEnabled,
    ),
    region: useFacet(
      "region",
      debouncedQuery,
      JSON.stringify(filtersWith("region")),
      facetScope,
      facetsEnabled,
    ),
    material: useFacet(
      "material",
      debouncedQuery,
      JSON.stringify(filtersWith("material")),
      facetScope,
      facetsEnabled,
    ),
    lifecycleStatus: useFacet(
      "lifecycleStatus",
      debouncedQuery,
      JSON.stringify(filtersWith("lifecycleStatus")),
      facetScope,
      facetsEnabled,
    ),
  };

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

  function setPicked(next: Picked) {
    setPickedState({ org: orgVersion, value: next });
  }

  function toggleValue(name: FacetName, value: string) {
    const current = picked[name];
    setPicked({
      ...picked,
      [name]: current.includes(value)
        ? current.filter((entry) => entry !== value)
        : [...current, value],
    });
  }

  const chips: Array<{ key: string; label: string; clear: () => void }> = [];
  for (const name of FACET_NAMES) {
    for (const value of picked[name]) {
      chips.push({
        key: `${name}:${value}`,
        label: `${FACET_LABELS[name]}: ${value}`,
        clear: () => toggleValue(name, value),
      });
    }
  }
  if (yearFrom || yearTo) {
    chips.push({
      key: "year",
      label: `Year: ${yearFrom || "…"}–${yearTo || "…"}`,
      clear: () => {
        setYearFrom("");
        setYearTo("");
      },
    });
  }
  const filterCount = chips.length;

  function clearFilters() {
    setPicked(EMPTY_PICKED);
    setYearFrom("");
    setYearTo("");
  }

  function clearAll() {
    clearFilters();
    setSelectedNode(null);
    setQuery("");
    setSortKey(null);
  }

  const hasConstraints =
    filterCount > 0 || selectedNode !== null || query.trim() !== "";
  const orgName =
    profile.activeContext?.organizationName ?? "your organization";

  const sidebar = (
    <FacetPanel
      facets={facets}
      picked={picked}
      onToggle={toggleValue}
      yearFrom={yearFrom}
      yearTo={yearTo}
      onYearFrom={setYearFrom}
      onYearTo={setYearTo}
      activeCount={filterCount}
      onClear={clearFilters}
    />
  );

  return (
    <div className="flex h-full flex-col">
      <LevelsBar
        roots={roots}
        index={index}
        selectedId={selectedNode?.id ?? null}
        loading={treeLoading}
        error={treeError}
        allowedIds={allowedIds}
        onSelect={setSelectedNode}
        onRetry={() => setTreeReload((value) => value + 1)}
      />

      <div className="flex min-h-0 flex-1">
        <aside className="hidden w-72 shrink-0 overflow-y-auto border-r lg:block">
          {sidebar}
        </aside>

        <section className="flex min-w-0 flex-1 flex-col">
          <div className="space-y-3 border-b p-4">
            <div className="flex flex-wrap items-center gap-2">
              <Button
                variant="outline"
                className="lg:hidden"
                onClick={() => setFiltersOpen(true)}
              >
                <SlidersHorizontal /> Filters
                {filterCount > 0 ? (
                  <span className="rounded-full bg-hl-blue/12 px-1.5 font-mono text-[10px] text-hl-blue">
                    {filterCount}
                  </span>
                ) : null}
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
              {has("catalog.export") ? (
                <Button
                  variant="outline"
                  disabled
                  aria-label="Export (coming soon)"
                >
                  <Download />
                  <span className="hidden sm:inline">Export · soon</span>
                </Button>
              ) : null}
              {has("catalog.create") ? (
                <Button disabled aria-label="Add part (coming soon)">
                  <Plus />
                  <span className="hidden sm:inline">Add part · soon</span>
                </Button>
              ) : null}
            </div>

            {chips.length > 0 ? (
              <div className="flex flex-wrap items-center gap-2">
                {chips.map((chip) => (
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
                <Button variant="ghost" size="sm" onClick={clearFilters}>
                  Clear filters
                </Button>
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
                    Clear everything
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
                        <span className="block font-medium">
                          {item.partName}
                        </span>
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
                      {loadingMore ? (
                        <Loader2 className="animate-spin" />
                      ) : null}
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
      </div>

      <Sheet open={filtersOpen} onOpenChange={setFiltersOpen}>
        <SheetContent side="left" className="w-80 overflow-y-auto p-0">
          <SheetHeader className="sr-only">
            <SheetTitle>Filters</SheetTitle>
          </SheetHeader>
          {sidebar}
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
