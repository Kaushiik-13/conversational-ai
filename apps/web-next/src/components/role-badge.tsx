import { Badge } from "@/components/ui/badge";
import { HUE_BADGE, roleHue, roleLabel } from "@/lib/highlights";

export function RoleBadge({ role }: { role: string }) {
  return (
    <Badge
      variant="outline"
      className={`font-mono text-[10px] font-medium tracking-wide uppercase ${HUE_BADGE[roleHue(role)]}`}
    >
      {roleLabel(role)}
    </Badge>
  );
}
