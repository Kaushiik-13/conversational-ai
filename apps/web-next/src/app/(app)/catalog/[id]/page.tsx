import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PartPage } from "@/components/part/part-page";
import { BRAND } from "@/lib/brand";

export const metadata: Metadata = { title: `Part · ${BRAND.name}` };

export default async function PartRoute({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const partId = Number(id);
  if (!Number.isInteger(partId) || partId < 1) notFound();
  return <PartPage id={partId} />;
}
