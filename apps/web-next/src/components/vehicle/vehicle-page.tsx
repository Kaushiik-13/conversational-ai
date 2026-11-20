"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { AlertCircle, ArrowLeft, Loader2, SearchX } from "lucide-react";
import { useCategoryIndex } from "@/components/catalog/use-category-index";
import { PartRows } from "@/components/part/part-rows";
import { useSession } from "@/components/session-provider";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { apiRequestFull } from "@/lib/api";
import type { SearchItem, SearchMeta } from "@/lib/catalog-types";
import { HUE_DOT, domainHue } from "@/lib/highlights";

const WANT = 25;
const MAX_PAGES = 4;

/**
 * The API has no exact vehicle filter, so we search by name and keep only
 * parts whose vehicle program matches exactly, scanning a few pages at a time.
 */
async function scan(
  name: string,
  startCursor: string | null,
  signal: AbortSignal,
): Promise<{ found: SearchItem[]; cursor: string | null }> {
  const found: SearchItem[] = [];
  let cursor = startCursor;
  let pages = 0;
  do {
    const response = await apiRequestFull<{ items: SearchItem[] }, SearchMeta>(
      "/search",
      {
        method: "POST",
        signal,
        body: {
          query: name,
          filters: {},
          facets: [],
          sort: { field: "partNumber", direction: "asc" },
          limit: 100,
          ...(cursor ? { cursor } : {}),
        },
      },
    );
    found.push(
      ...response.data.items.filter((item) => item.vehicleProgram === name),
    );
    cursor = response.meta.nextCursor;
    pages += 1;
  } while (cursor && found.length < WANT && pages < MAX_PAGES);
  return { found, cursor };
}

export function VehiclePage({ name }: { name: string }) {
  const { orgVersion } = useSession();
  const { index } = useCategoryIndex();
  const key = `${orgVersion}:${name}`;
  const [state, setState] = useState<{
    key: string;
    items: SearchItem[];
    cursor: string | null;
    error: string;
  } | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [moreError, setMoreError] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    scan(name, null, controller.signal)
      .then(({ found, cursor }) =>
        setState({ key, items: found, cursor, error: "" }),
      )
      .catch((failure) => {
        if (controller.signal.aborted) return;
        setState({
          key,
          items: [],
          cursor: null,
          error:
            failure instanceof Error
              ? failure.message
              : "This vehicle could not be loaded.",
        });
      });
    return () => controller.abort();
  }, [key, name]);

  const current = state?.key === key ? state : null;
  const items = useMemo(() => current?.items ?? [], [current]);

  const summary = useMemo(() => {
    const years = items.map((item) => item.modelYear);
    const markets = [...new Set(items.map((item) => item.region))].sort();
    const domains = new Map<number, string>();
    for (const item of items) {
      const domain = index.get(item.primaryCategoryId)?.domain;
      if (domain) domains.set(domain.id, domain.name);
    }
    return {
      from: years.length ? Math.min(...years) : null,
      to: years.length ? Math.max(...years) : null,
      markets,
      domains: [...domains.entries()].sort((a, b) => a[1].localeCompare(b[1])),
    };
  }, [items, index]);

  async function loadMore() {
    if (!current?.cursor || loadingMore) return;
    setLoadingMore(true);
    setMoreError("");
    try {
      const controller = new AbortController();
      const { found, cursor } = await scan(
        name,
        current.cursor,
        controller.signal,
      );
      setState((previous) =>
        previous && previous.key === key
          ? { ...previous, items: [...previous.items, ...found], cursor }
          : previous,
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

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-6xl space-y-6 p-4 sm:p-6">
        <Link
          href="/catalog"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" aria-hidden /> Catalog
        </Link>

        <header className="space-y-3">
          <p className="font-mono text-[11px] tracking-wide text-muted-foreground uppercase">
            Vehicle program
          </p>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
            {name}
          </h1>
          {current && items.length > 0 ? (
            <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
              <span>
                <strong className="font-semibold">
                  {items.length.toLocaleString()}
                  {current.cursor ? "+" : ""}
                </strong>{" "}
                parts found
              </span>
              {summary.from !== null ? (
                <span>
                  Model years{" "}
                  <strong className="font-semibold">
                    {summary.from === summary.to
                      ? summary.from
                      : `${summary.from}–${summary.to}`}
                  </strong>
                </span>
              ) : null}
              <span>
                <strong className="font-semibold">
                  {summary.markets.length}
                </strong>{" "}
                {summary.markets.length === 1 ? "market" : "markets"}
              </span>
            </div>
          ) : null}
          {summary.domains.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {summary.domains.map(([id, domainName]) => (
                <Link
                  key={id}
                  href={`/catalog?level=${id}`}
                  className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs hover:bg-muted"
                >
                  <span
                    aria-hidden
                    className={`size-2 rounded-full ${HUE_DOT[domainHue(id)]}`}
                  />
                  {domainName}
                </Link>
              ))}
            </div>
          ) : null}
        </header>

        <section className="rounded-xl border">
          <div className="flex items-center justify-between gap-3 border-b px-4 py-3">
            <h2 className="font-mono text-[11px] tracking-wide text-muted-foreground uppercase">
              Parts that fit
            </h2>
            {!current ? (
              <Loader2
                className="size-4 animate-spin text-muted-foreground"
                aria-hidden
              />
            ) : null}
          </div>

          {!current ? (
            <div className="space-y-2 p-4" aria-label="Loading parts">
              {Array.from({ length: 6 }).map((_, row) => (
                <Skeleton key={row} className="h-10 w-full" />
              ))}
            </div>
          ) : current.error ? (
            <div className="p-4">
              <Alert variant="destructive" role="alert">
                <AlertCircle />
                <AlertTitle>Couldn&apos;t load this vehicle</AlertTitle>
                <AlertDescription>{current.error}</AlertDescription>
              </Alert>
            </div>
          ) : items.length === 0 ? (
            <div className="flex flex-col items-center gap-2 p-10 text-center">
              <SearchX className="size-7 text-muted-foreground" aria-hidden />
              <p className="font-medium">No visible parts for this vehicle</p>
              <p className="text-sm text-muted-foreground">
                It may not exist, or none are in your organization&apos;s
                catalog.
              </p>
            </div>
          ) : (
            <>
              <PartRows items={items} index={index} />
              {moreError ? (
                <p
                  className="px-4 pt-3 text-center text-sm text-destructive"
                  role="alert"
                >
                  {moreError}
                </p>
              ) : null}
              {current.cursor ? (
                <div className="flex justify-center p-4">
                  <Button
                    variant="outline"
                    onClick={loadMore}
                    disabled={loadingMore}
                  >
                    {loadingMore ? <Loader2 className="animate-spin" /> : null}
                    {loadingMore ? "Searching" : "Find more"}
                  </Button>
                </div>
              ) : (
                <p className="p-4 text-center text-xs text-muted-foreground">
                  End of results
                </p>
              )}
            </>
          )}
        </section>

        <p className="text-xs text-muted-foreground">
          Parts are matched by vehicle name. The summary reflects the parts
          found so far.
        </p>
      </div>
    </div>
  );
}
