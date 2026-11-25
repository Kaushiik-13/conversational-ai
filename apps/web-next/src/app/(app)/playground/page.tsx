import type { Metadata } from "next";
import { PlaygroundPage } from "@/components/playground/playground-page";
import { BRAND } from "@/lib/brand";

export const metadata: Metadata = { title: `Playground · ${BRAND.name}` };

export default function PlaygroundRoute() {
  return <PlaygroundPage />;
}
