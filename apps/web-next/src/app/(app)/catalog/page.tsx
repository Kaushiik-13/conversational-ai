import type { Metadata } from "next";
import { Suspense } from "react";
import { CatalogView } from "@/components/catalog/catalog-view";
import { BRAND } from "@/lib/brand";

export const metadata: Metadata = { title: `Catalog · ${BRAND.name}` };

export default function CatalogPage() {
  return (
    <Suspense fallback={null}>
      <CatalogView />
    </Suspense>
  );
}
