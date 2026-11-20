"use client";

import { Check } from "lucide-react";
import { useCompare } from "@/components/compare/use-compare";
import type { CompareEntry } from "@/lib/compare-store";

/** A small checkbox that adds or removes a part from the compare selection. */
export function CompareCheckbox({ part }: { part: CompareEntry }) {
  const { has, toggle, full, max } = useCompare();
  const selected = has(part.id);
  const blocked = full && !selected;

  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={selected}
      aria-label={`Compare ${part.partNumber}`}
      disabled={blocked}
      title={blocked ? `You can compare up to ${max} parts` : "Add to compare"}
      onClick={(event) => {
        event.stopPropagation();
        toggle({
          id: part.id,
          partNumber: part.partNumber,
          partName: part.partName,
        });
      }}
      className={`flex size-5 shrink-0 items-center justify-center rounded border transition-colors ${
        selected
          ? "border-hl-blue bg-hl-blue text-background"
          : "border-input hover:border-hl-blue/60"
      } ${blocked ? "cursor-not-allowed opacity-40" : ""}`}
    >
      {selected ? <Check className="size-3.5" aria-hidden /> : null}
    </button>
  );
}
