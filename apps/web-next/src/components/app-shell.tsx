"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronsUpDown, KeyRound, LogOut, Menu } from "lucide-react";
import { AppRail } from "@/components/app-rail";
import { BrandLogo } from "@/components/brand-logo";
import { NAV, initials } from "@/components/nav-items";
import { RoleBadge } from "@/components/role-badge";
import { useSession } from "@/components/session-provider";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { roleLabel } from "@/lib/highlights";

function OrganizationSwitcher() {
  const { profile, switchOrganization } = useSession();
  const [error, setError] = useState("");
  const active = profile.activeContext;
  const options = profile.memberships;

  if (options.length <= 1) {
    return (
      <div className="rounded-lg border px-3 py-2">
        <p className="font-mono text-[10px] tracking-wide text-muted-foreground uppercase">
          Organization
        </p>
        <p className="truncate text-sm font-medium">
          {active?.organizationName ?? "No organization"}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-1">
      <p className="px-1 font-mono text-[10px] tracking-wide text-muted-foreground uppercase">
        Organization
      </p>
      <Select
        value={active?.organizationId ?? ""}
        onValueChange={(value) => {
          if (typeof value !== "string" || value === active?.organizationId) {
            return;
          }
          setError("");
          switchOrganization(value).catch(() =>
            setError("Couldn't switch organization."),
          );
        }}
      >
        <SelectTrigger className="w-full" aria-label="Switch organization">
          <SelectValue>
            {(value) =>
              options.find((option) => option.organizationId === value)
                ?.organizationName ?? "Choose organization"
            }
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          {options.map((option) => (
            <SelectItem key={option.membershipId} value={option.organizationId}>
              <span className="flex w-full items-center justify-between gap-3">
                {option.organizationName}
                <span className="font-mono text-[10px] text-muted-foreground uppercase">
                  {roleLabel(option.role)}
                </span>
              </span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {error ? <p className="px-1 text-xs text-destructive">{error}</p> : null}
    </div>
  );
}

function SidebarContent({ onNavigate }: { onNavigate?: () => void }) {
  const { profile, has, signOut } = useSession();
  const pathname = usePathname();
  const items = NAV.filter((item) => has(item.capability));
  const role = profile.activeContext?.role ?? "";

  return (
    <div className="flex h-full flex-col gap-6 p-4">
      <div className="px-1 pt-1">
        <BrandLogo />
      </div>

      <OrganizationSwitcher />

      <nav aria-label="Main" className="flex-1 space-y-1">
        <p className="px-1 pb-1 font-mono text-[10px] tracking-wide text-muted-foreground uppercase">
          Workspace
        </p>
        {items.map((item) => {
          const Icon = item.icon;
          const active =
            pathname === item.href || pathname.startsWith(`${item.href}/`);
          if (!item.ready) {
            return (
              <div
                key={item.href}
                aria-disabled
                className="flex items-center gap-3 rounded-md px-2.5 py-2 text-sm text-muted-foreground/70"
              >
                <Icon className="size-4" aria-hidden />
                <span className="flex-1">{item.label}</span>
                <span className="font-mono text-[10px] uppercase">Soon</span>
              </div>
            );
          }
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={onNavigate}
              aria-current={active ? "page" : undefined}
              className={`flex items-center gap-3 rounded-md px-2.5 py-2 text-sm transition-colors ${
                active
                  ? "bg-hl-blue/10 font-medium text-hl-blue"
                  : "text-foreground/80 hover:bg-muted"
              }`}
            >
              <Icon className="size-4" aria-hidden />
              {item.label}
            </Link>
          );
        })}
      </nav>

      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <button
              type="button"
              className="flex w-full items-center gap-3 rounded-lg border p-2 text-left transition-colors hover:bg-muted"
            />
          }
        >
          <span
            aria-hidden
            className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground"
          >
            {initials(profile.user.displayName)}
          </span>
          <span className="min-w-0 flex-1 space-y-1">
            <span className="block truncate text-sm font-medium">
              {profile.user.displayName}
            </span>
            <RoleBadge role={role} />
          </span>
          <ChevronsUpDown
            className="size-4 text-muted-foreground"
            aria-hidden
          />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-56">
          <div className="px-2 py-1.5 text-xs text-muted-foreground">
            {profile.user.email}
          </div>
          <DropdownMenuSeparator />
          <DropdownMenuItem render={<Link href="/change-password" />}>
            <KeyRound /> Change password
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => void signOut()}>
            <LogOut /> Sign out
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <div className="flex h-dvh overflow-hidden">
      <AppRail />

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 shrink-0 items-center gap-3 border-b px-4 lg:hidden">
          <Button
            variant="ghost"
            size="icon"
            aria-label="Open menu"
            onClick={() => setMenuOpen(true)}
          >
            <Menu />
          </Button>
          <BrandLogo />
        </header>

        <main className="min-h-0 flex-1 overflow-hidden">{children}</main>
      </div>

      <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
        <SheetContent side="left" className="w-72 p-0">
          <SheetHeader className="sr-only">
            <SheetTitle>Menu</SheetTitle>
          </SheetHeader>
          <SidebarContent onNavigate={() => setMenuOpen(false)} />
        </SheetContent>
      </Sheet>
    </div>
  );
}
