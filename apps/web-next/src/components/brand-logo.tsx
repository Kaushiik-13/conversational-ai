import { MessagesSquare } from "lucide-react";
import { BRAND } from "@/lib/brand";

export function BrandLogo({ className = "" }: { className?: string }) {
  return (
    <div className={`flex items-center gap-2 font-semibold ${className}`}>
      <span className="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
        <MessagesSquare className="size-4" aria-hidden />
      </span>
      <span className="text-lg">{BRAND.name}</span>
    </div>
  );
}
