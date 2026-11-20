"use client";

import { useEffect, useState } from "react";
import { AlertCircle } from "lucide-react";
import { useSession } from "@/components/session-provider";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { ApiError, apiRequest } from "@/lib/api";
import type { CatalogRecord } from "@/lib/catalog-types";
import { HUE_DOT, domainHue, roleLabel } from "@/lib/highlights";
import type { CategoryInfo } from "./category-utils";
import { StatusBadge } from "./status-badge";

interface PartDrawerProps {
  partId: number | null;
  index: Map<number, CategoryInfo>;
  onClose: () => void;
}

function Field({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="space-y-0.5">
      <dt className="font-mono text-[10px] tracking-wide text-muted-foreground uppercase">
        {label}
      </dt>
      <dd className="text-sm">{value || "—"}</dd>
    </div>
  );
}

export function PartDrawer({ partId, index, onClose }: PartDrawerProps) {
  const { profile, has } = useSession();
  const [result, setResult] = useState<{
    id: number;
    part: CatalogRecord | null;
    error: string;
  } | null>(null);

  useEffect(() => {
    if (partId === null) return;
    const controller = new AbortController();
    apiRequest<CatalogRecord>(`/catalog/parts/${partId}`, {
      signal: controller.signal,
    })
      .then((part) => setResult({ id: partId, part, error: "" }))
      .catch((failure) => {
        if (controller.signal.aborted) return;
        setResult({
          id: partId,
          part: null,
          error:
            failure instanceof ApiError && failure.status === 404
              ? "This part isn't in your visible catalog."
              : failure instanceof Error
                ? failure.message
                : "The part could not be loaded.",
        });
      });
    return () => controller.abort();
  }, [partId]);

  const current = result && result.id === partId ? result : null;
  const loading = partId !== null && current === null;
  const part = current?.part ?? null;
  const error = current?.error ?? "";

  const info = part ? index.get(part.primaryCategoryId) : undefined;
  const role = profile.activeContext?.role ?? "";
  const canEdit = has("catalog.update");
  const canArchive = has("catalog.archive");

  return (
    <Sheet open={partId !== null} onOpenChange={(open) => !open && onClose()}>
      <SheetContent side="right" className="w-full gap-0 sm:max-w-md">
        <SheetHeader className="border-b">
          <SheetTitle className="font-mono text-base">
            {part?.partNumber ?? "Part details"}
          </SheetTitle>
          <SheetDescription>
            {part?.partName ?? "Loading the record…"}
          </SheetDescription>
        </SheetHeader>

        <div className="min-h-0 flex-1 space-y-6 overflow-y-auto p-4">
          {loading ? (
            <div className="space-y-3" aria-label="Loading part">
              <Skeleton className="h-6 w-1/2" />
              <Skeleton className="h-20 w-full" />
              <Skeleton className="h-40 w-full" />
            </div>
          ) : error ? (
            <Alert variant="destructive" role="alert">
              <AlertCircle />
              <AlertTitle>Couldn&apos;t open this part</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : part ? (
            <>
              <div className="space-y-3">
                <div className="flex flex-wrap items-center gap-2">
                  <StatusBadge status={part.lifecycleStatus} />
                  {!part.active ? (
                    <span className="font-mono text-[11px] text-muted-foreground uppercase">
                      Archived
                    </span>
                  ) : null}
                </div>
                {info ? (
                  <p className="flex flex-wrap items-center gap-1.5 text-sm text-muted-foreground">
                    <span
                      aria-hidden
                      className={`size-2 rounded-full ${
                        info.domain
                          ? HUE_DOT[domainHue(info.domain.id)]
                          : "bg-border"
                      }`}
                    />
                    {info.trail.map((level, position) => (
                      <span key={level.id}>
                        {position > 0 ? "› " : ""}
                        {level.name}
                      </span>
                    ))}
                  </p>
                ) : null}
                <p className="text-sm leading-relaxed">{part.description}</p>
              </div>

              <dl className="grid grid-cols-2 gap-x-4 gap-y-4 border-t pt-4">
                <Field label="Manufacturer" value={part.manufacturer} />
                <Field label="Vehicle program" value={part.vehicleProgram} />
                <Field label="Region" value={part.region} />
                <Field label="Country" value={part.country} />
                <Field label="Plant" value={part.plant} />
                <Field label="Model year" value={part.modelYear} />
                <Field label="Material" value={part.material} />
                <Field label="Weight" value={`${part.weightKg} kg`} />
                {part.costUsd !== undefined ? (
                  <Field label="Cost" value={`$${part.costUsd}`} />
                ) : null}
                {part.supplierStatus !== undefined ? (
                  <Field label="Supplier status" value={part.supplierStatus} />
                ) : null}
              </dl>

              <p className="border-t pt-4 text-xs text-muted-foreground">
                You&apos;re viewing this as {roleLabel(role)}. Fields your role
                can&apos;t see aren&apos;t shown. Record version {part.version}.
              </p>
            </>
          ) : null}
        </div>

        {canEdit || canArchive ? (
          <div className="flex gap-2 border-t p-4">
            {canEdit ? (
              <Button variant="outline" disabled>
                Edit · soon
              </Button>
            ) : null}
            {canArchive ? (
              <Button variant="outline" disabled>
                Archive · soon
              </Button>
            ) : null}
          </div>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}
