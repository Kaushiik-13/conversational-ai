import type { ReactNode } from "react";
import { AppShell } from "@/components/app-shell";
import { SessionProvider } from "@/components/session-provider";
import { TooltipProvider } from "@/components/ui/tooltip";

export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <SessionProvider>
      <TooltipProvider>
        <AppShell>{children}</AppShell>
      </TooltipProvider>
    </SessionProvider>
  );
}
