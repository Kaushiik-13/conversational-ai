import { BRAND } from "@/lib/brand";

export function BrandLogo({ className = "" }: { className?: string }) {
  return (
    <div
      className={`flex items-center gap-1 text-[15px] font-semibold tracking-tight ${className}`}
    >
      <span>{BRAND.name}</span>
      <span
        aria-hidden
        className="motion-safe-anim h-4 w-[2px] bg-signal"
        style={{ animation: "caret-blink 1.1s steps(1) infinite" }}
      />
    </div>
  );
}
