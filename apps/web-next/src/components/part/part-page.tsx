"use client";

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import {
  AlertCircle,
  ArrowLeft,
  Check,
  ChevronRight,
  Link2,
} from "lucide-react";
import { useCategoryIndex } from "@/components/catalog/use-category-index";
import { StatusBadge } from "@/components/catalog/status-badge";
import { RelatedParts } from "@/components/part/related-parts";
import { useSession } from "@/components/session-provider";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ApiError, apiRequest } from "@/lib/api";
import type { CatalogRecord } from "@/lib/catalog-types";
import { HUE_DOT, domainHue, roleLabel } from "@/lib/highlights";

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-xl border">
      <h2 className="border-b px-4 py-3 font-mono text-[11px] tracking-wide text-muted-foreground uppercase">
        {title}
      </h2>
      <div className="p-4">{children}</div>
    </section>
  );
}

function Row({
  label,
  value,
  href,
  mono,
}: {
  label: string;
  value: string | number;
  href?: string;
  mono?: boolean;
}) {
  return (
    <div className="grid grid-cols-[8.5rem_1fr] items-baseline gap-3 border-b py-2.5 last:border-b-0 sm:grid-cols-[11rem_1fr]">
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className={`text-sm ${mono ? "font-mono" : ""}`}>
        {href ? (
          <Link
            href={href}
            className="inline-flex items-center gap-1 text-hl-blue underline-offset-4 hover:underline"
          >
            {value || "—"}
            <ChevronRight className="size-3.5" aria-hidden />
          </Link>
        ) : (
          value || "—"
        )}
      </dd>
    </div>
  );
}

export function PartPage({ id }: { id: number }) {
  const { profile, has, orgVersion } = useSession();
  const { index } = useCategoryIndex();
  const [copied, setCopied] = useState(false);
  const key = `${orgVersion}:${id}`;
  const [state, setState] = useState<{
    key: string;
    part: CatalogRecord | null;
    error: string;
    notFound: boolean;
  } | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    apiRequest<CatalogRecord>(`/catalog/parts/${id}`, {
      signal: controller.signal,
    })
      .then((part) => setState({ key, part, error: "", notFound: false }))
      .catch((failure) => {
        if (controller.signal.aborted) return;
        setState({
          key,
          part: null,
          notFound: failure instanceof ApiError && failure.status === 404,
          error:
            failure instanceof Error
              ? failure.message
              : "The part could not be loaded.",
        });
      });
    return () => controller.abort();
  }, [key, id]);

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // Clipboard access can be blocked; nothing else to do.
    }
  }

  const current = state?.key === key ? state : null;
  const part = current?.part ?? null;
  const info = part ? index.get(part.primaryCategoryId) : undefined;
  const role = profile.activeContext?.role ?? "";
  const vehicleHref = part
    ? `/vehicles/${encodeURIComponent(part.vehicleProgram)}`
    : "";

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-6xl space-y-6 p-4 sm:p-6">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-sm">
          <Link
            href="/catalog"
            className="inline-flex items-center gap-1.5 text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="size-4" aria-hidden /> Catalog
          </Link>
          {info ? (
            <nav
              aria-label="Part level"
              className="flex flex-wrap items-center gap-1 text-muted-foreground"
            >
              <span
                aria-hidden
                className={`size-2 rounded-full ${
                  info.domain ? HUE_DOT[domainHue(info.domain.id)] : "bg-border"
                }`}
              />
              {info.trail.map((level, position) => (
                <span key={level.id} className="flex items-center gap-1">
                  {position > 0 ? (
                    <ChevronRight className="size-3.5" aria-hidden />
                  ) : null}
                  <Link
                    href={`/catalog?level=${level.id}`}
                    className="hover:text-foreground"
                  >
                    {level.name}
                  </Link>
                </span>
              ))}
            </nav>
          ) : null}
        </div>

        {!current ? (
          <div className="space-y-4" aria-label="Loading part">
            <Skeleton className="h-9 w-2/3" />
            <Skeleton className="h-5 w-1/3" />
            <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
              <Skeleton className="h-96" />
              <Skeleton className="h-64" />
            </div>
          </div>
        ) : current.error || !part ? (
          <Alert variant="destructive" role="alert">
            <AlertCircle />
            <AlertTitle>
              {current.notFound ? "Part not found" : "Couldn't open this part"}
            </AlertTitle>
            <AlertDescription>
              {current.notFound
                ? "It may not exist, or it isn't in your organization's visible catalog."
                : current.error}
            </AlertDescription>
          </Alert>
        ) : (
          <>
            <header className="flex flex-wrap items-start justify-between gap-4">
              <div className="min-w-0 space-y-2">
                <div className="flex flex-wrap items-center gap-3">
                  <span className="font-mono text-sm text-muted-foreground">
                    {part.partNumber}
                  </span>
                  <StatusBadge status={part.lifecycleStatus} />
                  {!part.active ? (
                    <span className="font-mono text-[11px] text-muted-foreground uppercase">
                      Archived
                    </span>
                  ) : null}
                </div>
                <h1 className="text-2xl font-semibold tracking-tight text-balance sm:text-3xl">
                  {part.partName}
                </h1>
                <p className="text-sm text-muted-foreground">
                  by {part.manufacturer} ·{" "}
                  <Link
                    href={vehicleHref}
                    className="text-hl-blue underline-offset-4 hover:underline"
                  >
                    {part.vehicleProgram}
                  </Link>{" "}
                  {part.modelYear} · {part.region}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Button variant="outline" onClick={copyLink}>
                  {copied ? <Check /> : <Link2 />}
                  {copied ? "Link copied" : "Copy link"}
                </Button>
                {has("catalog.update") ? (
                  <Button variant="outline" disabled>
                    Edit · soon
                  </Button>
                ) : null}
                {has("catalog.archive") ? (
                  <Button variant="outline" disabled>
                    Archive · soon
                  </Button>
                ) : null}
              </div>
            </header>

            <div className="grid items-start gap-6 lg:grid-cols-[1fr_20rem]">
              <div className="space-y-6">
                <Section title="Overview">
                  <p className="text-sm leading-relaxed">{part.description}</p>
                </Section>

                <Section title="Specifications">
                  <dl>
                    <Row label="Material" value={part.material} />
                    <Row label="Weight" value={`${part.weightKg} kg`} />
                    {part.costUsd !== undefined ? (
                      <Row label="Cost" value={`$${part.costUsd}`} mono />
                    ) : null}
                  </dl>
                </Section>

                <Section title="Fitment">
                  <dl>
                    <Row
                      label="Vehicle program"
                      value={part.vehicleProgram}
                      href={vehicleHref}
                    />
                    <Row label="Model year" value={part.modelYear} />
                    <Row label="Market" value={part.region} />
                    <Row label="Country" value={part.country} />
                  </dl>
                </Section>

                <Section title="Sourcing">
                  <dl>
                    <Row label="Manufacturer" value={part.manufacturer} />
                    <Row label="Plant" value={part.plant} />
                    {part.supplierStatus !== undefined ? (
                      <Row
                        label="Supplier status"
                        value={part.supplierStatus}
                      />
                    ) : null}
                    {part.sourceSystem !== undefined ? (
                      <Row label="Source system" value={part.sourceSystem} />
                    ) : null}
                  </dl>
                </Section>

                <Section title="Classification">
                  <dl>
                    <Row label="Commodity" value={part.commodity} />
                    <Row label="Sub-commodity" value={part.subCommodity} />
                    <Row
                      label="Level"
                      value={
                        info?.trail.map((level) => level.name).join(" › ") ?? ""
                      }
                      href={
                        info
                          ? `/catalog?level=${part.primaryCategoryId}`
                          : undefined
                      }
                    />
                  </dl>
                </Section>
              </div>

              <aside className="space-y-4 lg:sticky lg:top-6">
                <section className="rounded-xl border">
                  <h2 className="border-b px-4 py-3 font-mono text-[11px] tracking-wide text-muted-foreground uppercase">
                    At a glance
                  </h2>
                  <dl className="px-4 py-1">
                    <Row label="Status" value={part.lifecycleStatus} />
                    <Row label="Model year" value={part.modelYear} />
                    <Row label="Weight" value={`${part.weightKg} kg`} />
                    <Row label="Material" value={part.material} />
                    <Row label="Record" value={`#${part.id}`} mono />
                    <Row label="Version" value={part.version} mono />
                  </dl>
                </section>
                <p className="text-xs text-muted-foreground">
                  You&apos;re viewing this as {roleLabel(role)}. Fields your
                  role can&apos;t see aren&apos;t shown.
                </p>
              </aside>
            </div>

            <RelatedParts part={part} index={index} />
          </>
        )}
      </div>
    </div>
  );
}
