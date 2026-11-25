"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  Box,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Lock,
  MousePointerClick,
  Move3d,
  RotateCcw,
} from "lucide-react";
import { useCategoryIndex } from "@/components/catalog/use-category-index";
import { useSession } from "@/components/session-provider";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { buildSystems, type ListSlot, type SystemDef } from "./systems";

// 3D drawing only works in the browser.
const loadingScene = () => <Skeleton className="size-full" />;
const CarScene = dynamic(() => import("./car-scene"), {
  ssr: false,
  loading: loadingScene,
});
const SchematicScene = dynamic(() => import("./schematic-scene"), {
  ssr: false,
  loading: loadingScene,
});

export function PlaygroundPage() {
  const { profile } = useSession();
  const { index, loading } = useCategoryIndex();
  const [systemId, setSystemId] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  // Start apart, so the first system you see assembles itself.
  const [exploded, setExploded] = useState(true);
  const [board, setBoard] = useState(false);
  const assembleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [group, setGroup] = useState<string | null>(null);

  const levels = useMemo(() => Array.from(index.values()), [index]);
  const systems = useMemo(() => buildSystems(levels), [levels]);

  // A user who can see just one system goes straight into it.
  const onlyOne = systems.length === 1;
  const active: SystemDef | null =
    (onlyOne ? systems[0] : systems.find((entry) => entry.id === systemId)) ??
    null;

  const visibleSlots: ListSlot[] = active
    ? active.slots.filter((entry) => group === null || entry.group === group)
    : [];
  const slot = active?.slots.find((entry) => entry.id === selected) ?? null;
  const position = visibleSlots.findIndex((entry) => entry.id === selected);
  const level = slot
    ? levels.find((info) => info.node.path === slot.categoryPath)
    : undefined;
  const orgName =
    profile.activeContext?.organizationName ?? "Your organization";
  const partTotal = systems.reduce((sum, entry) => sum + entry.slots.length, 0);

  // Parts come together shortly after the first view appears.
  useEffect(() => {
    assembleTimer.current = setTimeout(() => setExploded(false), 1600);
    return () => {
      if (assembleTimer.current) clearTimeout(assembleTimer.current);
    };
  }, []);

  function openSystem(next: string | null) {
    if (assembleTimer.current) clearTimeout(assembleTimer.current);
    setSystemId(next);
    setSelected(null);
    setGroup(null);
    setBoard(false);
    // Fly in with the parts apart, then let them assemble.
    const detailed = systems.find((entry) => entry.id === next)?.detailed;
    setExploded(Boolean(detailed));
    if (detailed) {
      assembleTimer.current = setTimeout(() => setExploded(false), 1400);
    }
  }

  /** Step through the parts in order; past the ends it returns to the overview. */
  function goTo(next: number) {
    setSelected(visibleSlots[next]?.id ?? null);
  }

  function chooseGroup(next: string | null) {
    setGroup(next);
    setSelected(null);
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-7xl space-y-5 p-4 sm:p-6">
        <header className="space-y-1">
          {active && !onlyOne ? (
            <button
              type="button"
              onClick={() => openSystem(null)}
              className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
            >
              <ArrowLeft className="size-4" aria-hidden /> Whole vehicle
            </button>
          ) : null}
          <p className="font-mono text-[11px] tracking-wide text-muted-foreground uppercase">
            Playground · {orgName}
          </p>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
            {active ? `${active.label} system` : "Whole vehicle"}
          </h1>
          <p className="text-sm text-muted-foreground">
            {active
              ? "Every part here is a level in your catalog. Drag to turn it and click a part to learn what it does."
              : "Click a numbered pin, or pick a system from the list, to open it. You only see the systems your organization can access."}
          </p>
        </header>

        {loading ? (
          <Skeleton className="h-[28rem] w-full rounded-xl" />
        ) : systems.length === 0 ? (
          <div className="flex flex-col items-center gap-3 rounded-xl border px-6 py-16 text-center">
            <Lock className="size-8 text-muted-foreground" aria-hidden />
            <p className="font-medium">
              No playground for your organization yet
            </p>
            <p className="max-w-md text-sm text-muted-foreground">
              The playground shows the vehicle systems your organization has
              access to. None are available right now.
            </p>
          </div>
        ) : (
          <>
            {active && active.groups.length > 1 ? (
              <div
                role="group"
                aria-label={`Show part of the ${active.label} system`}
                className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1"
              >
                {[
                  { id: null, label: `All ${active.label.toLowerCase()}` },
                  ...active.groups,
                ].map((entry) => {
                  const on = group === entry.id;
                  return (
                    <button
                      key={entry.id ?? "all"}
                      type="button"
                      aria-pressed={on}
                      onClick={() => chooseGroup(entry.id)}
                      className={`shrink-0 rounded-full border px-3 py-1.5 text-sm transition-colors ${
                        on
                          ? "border-foreground bg-foreground text-background"
                          : "text-muted-foreground hover:bg-muted"
                      }`}
                    >
                      {entry.label}
                    </button>
                  );
                })}
              </div>
            ) : null}

            <div className="grid gap-4 lg:grid-cols-[1fr_21rem]">
              <div className="relative h-[28rem] overflow-hidden rounded-xl border bg-gradient-to-b from-muted/40 to-background sm:h-[36rem]">
                {active && board ? (
                  <SchematicScene
                    key={active.id}
                    slots={active.slots}
                    selected={selected}
                    group={group}
                    onSelect={setSelected}
                  />
                ) : (
                  <CarScene
                    systems={systems}
                    focus={active?.id ?? null}
                    selected={selected}
                    exploded={exploded}
                    group={group}
                    onFocus={openSystem}
                    onSelect={setSelected}
                  />
                )}
                <div className="absolute top-3 left-3 flex items-center gap-1.5 rounded-full border bg-background/80 px-3 py-1 text-xs text-muted-foreground backdrop-blur">
                  <Move3d className="size-3.5" aria-hidden />
                  Drag to rotate · scroll to zoom ·{" "}
                  {active ? "click a pin" : "click a system to fly in"}
                </div>
                {active ? (
                  <div className="absolute right-3 bottom-3 flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      className="bg-background/80 backdrop-blur"
                      onClick={() => {
                        setSelected(null);
                        setExploded(false);
                      }}
                    >
                      <RotateCcw /> Reset
                    </Button>
                    {!active.detailed ? (
                      <Button
                        variant="outline"
                        size="sm"
                        className="bg-background/80 backdrop-blur"
                        aria-pressed={board}
                        onClick={() => {
                          setBoard((value) => !value);
                          setSelected(null);
                        }}
                      >
                        <Box /> {board ? "Back to the car" : "Parts board"}
                      </Button>
                    ) : null}
                    {active.detailed && !board ? (
                      <Button
                        size="sm"
                        aria-pressed={exploded}
                        onClick={() => setExploded((value) => !value)}
                      >
                        <Box /> {exploded ? "Put together" : "Explode"}
                      </Button>
                    ) : null}
                  </div>
                ) : null}
              </div>

              <aside className="space-y-3">
                {!active ? (
                  <>
                    <h2 className="font-mono text-[11px] tracking-wide text-muted-foreground uppercase">
                      Systems you can open · {systems.length}
                    </h2>
                    <ol className="space-y-1.5">
                      {systems.map((entry, order) => (
                        <li key={entry.id}>
                          <button
                            type="button"
                            onClick={() => openSystem(entry.id)}
                            className="flex w-full items-center gap-3 rounded-lg border px-3 py-2 text-left transition-colors hover:bg-muted/60"
                          >
                            <span
                              aria-hidden
                              className="flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold text-white"
                              style={{ backgroundColor: entry.color }}
                            >
                              {order + 1}
                            </span>
                            <span className="flex-1 text-sm font-medium">
                              {entry.label}
                            </span>
                            <span className="font-mono text-xs text-muted-foreground">
                              {entry.slots.length} parts
                            </span>
                            <ChevronRight
                              className="size-4 text-muted-foreground"
                              aria-hidden
                            />
                          </button>
                        </li>
                      ))}
                    </ol>
                    <p className="text-xs text-muted-foreground">
                      {systems.length} systems and {partTotal} part types are
                      open to you. What you can do inside depends on your role.
                    </p>
                  </>
                ) : (
                  <>
                    <h2 className="font-mono text-[11px] tracking-wide text-muted-foreground uppercase">
                      {group === null
                        ? "Parts in this system"
                        : (active.groups.find((entry) => entry.id === group)
                            ?.label ?? "Parts")}
                    </h2>
                    <ol className="space-y-1.5">
                      {visibleSlots.map((entry) => {
                        const on = entry.id === selected;
                        return (
                          <li key={entry.id}>
                            <button
                              type="button"
                              aria-pressed={on}
                              onClick={() => setSelected(on ? null : entry.id)}
                              className={`flex w-full items-center gap-3 rounded-lg border px-3 py-2 text-left transition-colors ${
                                on
                                  ? "border-foreground/30 bg-muted"
                                  : "hover:bg-muted/60"
                              }`}
                            >
                              <span
                                aria-hidden
                                className="flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold text-white"
                                style={{ backgroundColor: entry.color }}
                              >
                                {entry.number}
                              </span>
                              <span className="flex-1 text-sm font-medium">
                                {entry.label}
                              </span>
                              {entry.quantity ? (
                                <span className="font-mono text-xs text-muted-foreground">
                                  ×{entry.quantity}
                                </span>
                              ) : null}
                            </button>
                          </li>
                        );
                      })}
                    </ol>

                    <div
                      className="rounded-lg border p-3 text-sm"
                      aria-live="polite"
                    >
                      {slot ? (
                        <div className="space-y-2">
                          <p className="font-medium">
                            {slot.number}. {slot.label}
                          </p>
                          <p className="text-muted-foreground">
                            {slot.summary}
                          </p>
                          {slot.connects ? (
                            <p className="text-muted-foreground">
                              {slot.connects}
                            </p>
                          ) : null}
                          {slot.quantity ? (
                            <p className="font-mono text-[11px] text-muted-foreground">
                              {slot.quantity} per set
                            </p>
                          ) : null}
                          {level ? (
                            <div className="space-y-1.5 border-t pt-2">
                              <p className="text-xs text-muted-foreground">
                                Catalog level:{" "}
                                <span className="text-foreground">
                                  {level.trail
                                    .map((node) => node.name)
                                    .join(" › ")}
                                </span>
                              </p>
                              <Link
                                href={`/catalog?level=${level.node.id}`}
                                className="inline-flex items-center gap-1 text-xs text-hl-blue underline-offset-4 hover:underline"
                              >
                                Open in catalog{" "}
                                <ExternalLink className="size-3" />
                              </Link>
                            </div>
                          ) : null}
                        </div>
                      ) : (
                        <div className="space-y-2 text-muted-foreground">
                          <p className="font-medium text-foreground">
                            New here? Three steps:
                          </p>
                          <p className="flex items-center gap-2">
                            <Move3d className="size-4 shrink-0" aria-hidden />
                            Drag to look around.
                          </p>
                          <p className="flex items-center gap-2">
                            <MousePointerClick
                              className="size-4 shrink-0"
                              aria-hidden
                            />
                            Click a numbered part, or press Start tour.
                          </p>
                          {active.groups.length > 1 ? (
                            <p className="flex items-center gap-2">
                              <Box className="size-4 shrink-0" aria-hidden />
                              Pick a group above to show just that part.
                            </p>
                          ) : null}
                        </div>
                      )}
                    </div>

                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        className="flex-1"
                        disabled={slot === null}
                        onClick={() => goTo(position - 1)}
                      >
                        <ChevronLeft /> Previous
                      </Button>
                      <Button
                        size="sm"
                        className="flex-1"
                        onClick={() => goTo(position + 1)}
                      >
                        {slot ? "Next" : "Start tour"} <ChevronRight />
                      </Button>
                    </div>
                  </>
                )}
              </aside>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
