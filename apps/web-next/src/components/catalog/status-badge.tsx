import { Badge } from "@/components/ui/badge";
import { HUE_BADGE, statusHue } from "@/lib/highlights";

export function StatusBadge({ status }: { status: string }) {
  return (
    <Badge
      variant="outline"
      className={`font-mono text-[11px] font-medium capitalize ${HUE_BADGE[statusHue(status)]}`}
    >
      {status}
    </Badge>
  );
}
