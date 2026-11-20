import { BRAND } from "@/lib/brand";

export function BrandLogo({ className = "" }: { className?: string }) {
  return (
    <div
      className={`flex items-baseline gap-0.5 font-display text-2xl leading-none ${className}`}
    >
      <span>{BRAND.name}</span>
      <span aria-hidden className="size-1.5 rounded-full bg-signal" />
    </div>
  );
}
