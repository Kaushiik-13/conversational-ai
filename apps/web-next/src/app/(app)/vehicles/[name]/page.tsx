import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { VehiclePage } from "@/components/vehicle/vehicle-page";
import { BRAND } from "@/lib/brand";

export const metadata: Metadata = { title: `Vehicle · ${BRAND.name}` };

export default async function VehicleRoute({
  params,
}: {
  params: Promise<{ name: string }>;
}) {
  const { name } = await params;
  let decoded = name;
  try {
    decoded = decodeURIComponent(name);
  } catch {
    // Keep the raw segment if it is not valid percent-encoding.
  }
  if (!decoded.trim() || decoded.length > 160) notFound();
  return <VehiclePage name={decoded} />;
}
