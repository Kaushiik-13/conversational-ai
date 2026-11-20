"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { GitCompareArrows, X } from "lucide-react";
import { useCompare } from "@/components/compare/use-compare";
import { Button } from "@/components/ui/button";

/** Floating bar that shows the parts picked for comparing. */
export function CompareTray() {
  const { items, count, max, remove, clear } = useCompare();
  const pathname = usePathname();

  if (count === 0 || pathname.startsWith("/compare")) return null;

  const href = `/compare?ids=${items.map((item) => item.id).join(",")}`;

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-4 z-40 flex justify-center px-4 lg:left-16">
      <div
        role="region"
        aria-label="Parts selected to compare"
        className="pointer-events-auto flex max-w-full flex-wrap items-center gap-3 rounded-xl border bg-background p-2 pl-3 shadow-lg"
      >
        <span className="flex items-center gap-2 text-sm font-medium">
          <GitCompareArrows className="size-4 text-hl-blue" aria-hidden />
          {count} of {max}
        </span>

        <ul className="flex flex-wrap items-center gap-1.5">
          {items.map((item) => (
            <li
              key={item.id}
              className="inline-flex items-center gap-1 rounded-full border bg-secondary/60 py-0.5 pr-1 pl-2.5 font-mono text-xs"
              title={item.partName}
            >
              {item.partNumber}
              <button
                type="button"
                onClick={() => remove(item.id)}
                aria-label={`Remove ${item.partNumber} from compare`}
                className="rounded-full p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                <X className="size-3" aria-hidden />
              </button>
            </li>
          ))}
        </ul>

        <div className="flex items-center gap-1">
          <Button variant="ghost" size="sm" onClick={clear}>
            Clear
          </Button>
          {count >= 2 ? (
            <Button
              size="sm"
              nativeButton={false}
              render={<Link href={href} />}
            >
              Compare
            </Button>
          ) : (
            <Button size="sm" disabled title="Pick at least 2 parts">
              Compare
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
