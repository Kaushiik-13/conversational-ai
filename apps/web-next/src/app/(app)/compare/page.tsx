import type { Metadata } from "next";
import { Suspense } from "react";
import { ComparePage } from "@/components/compare/compare-page";
import { BRAND } from "@/lib/brand";

export const metadata: Metadata = { title: `Compare · ${BRAND.name}` };

export default function CompareRoute() {
  return (
    <Suspense fallback={null}>
      <ComparePage />
    </Suspense>
  );
}
