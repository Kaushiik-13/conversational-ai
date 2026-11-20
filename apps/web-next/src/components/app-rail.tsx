"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Check, KeyRound, LogOut } from "lucide-react";
import { useSession } from "@/components/session-provider";
import {
  NAV,
  initials,
  isNavActive,
  type NavItem,
} from "@/components/nav-items";
import { RoleBadge } from "@/components/role-badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { HUE_DOT, roleHue, roleLabel } from "@/lib/highlights";

const ITEM =
  "relative flex size-10 items-center justify-center rounded-lg transition-colors";

function RailLink({ item, active }: { item: NavItem; active: boolean }) {
  const Icon = item.icon;

  if (!item.ready) {
    return (
      <Tooltip>
        <TooltipTrigger
          render={
            <div
              aria-disabled
              aria-label={`${item.label} (coming soon)`}
              className={`${ITEM} text-muted-foreground/50`}
            />
          }
        >
          <Icon className="size-5" aria-hidden />
        </TooltipTrigger>
        <TooltipContent side="right">{item.label} · soon</TooltipContent>
      </Tooltip>
    );
  }

  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Link
            href={item.href}
            aria-label={item.label}
            aria-current={active ? "page" : undefined}
            className={`${ITEM} ${
              active
                ? "bg-hl-blue/10 text-hl-blue"
                : "text-muted-foreground hover:bg-muted hover:text-foreground"
            }`}
          />
        }
      >
        {active ? (
          <span
            aria-hidden
            className="absolute top-1/2 -left-3 h-5 w-[3px] -translate-y-1/2 rounded-r bg-hl-blue"
          />
        ) : null}
        <Icon className="size-5" aria-hidden />
      </TooltipTrigger>
      <TooltipContent side="right">{item.label}</TooltipContent>
    </Tooltip>
  );
}

function OrganizationChip() {
  const { profile, switchOrganization } = useSession();
  const [error, setError] = useState("");
  const active = profile.activeContext;
  const name = active?.organizationName ?? "No organization";
  const chip = (
    <span className="flex size-10 items-center justify-center rounded-lg border bg-background font-mono text-xs font-semibold">
      {initials(name)}
    </span>
  );

  if (profile.memberships.length <= 1) {
    return (
      <div title={`Organization: ${name}`} aria-label={`Organization: ${name}`}>
        {chip}
      </div>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <button
            type="button"
            title={`${name} · switch organization`}
            aria-label={`Organization: ${name}. Switch organization`}
            className="rounded-lg transition-opacity hover:opacity-80"
          />
        }
      >
        {chip}
      </DropdownMenuTrigger>
      <DropdownMenuContent side="right" align="start" className="w-60">
        <div className="px-2 py-1.5 font-mono text-[10px] tracking-wide text-muted-foreground uppercase">
          Switch organization
        </div>
        {profile.memberships.map((membership) => {
          const current = membership.organizationId === active?.organizationId;
          return (
            <DropdownMenuItem
              key={membership.membershipId}
              onClick={() => {
                if (current) return;
                setError("");
                switchOrganization(membership.organizationId).catch(() =>
                  setError("Couldn't switch organization."),
                );
              }}
            >
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="truncate">{membership.organizationName}</span>
                <span className="font-mono text-[10px] text-muted-foreground uppercase">
                  {roleLabel(membership.role)}
                </span>
              </span>
              {current ? <Check className="size-4" aria-hidden /> : null}
            </DropdownMenuItem>
          );
        })}
        {error ? (
          <div className="px-2 py-1.5 text-xs text-destructive">{error}</div>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function AccountMenu() {
  const { profile, signOut } = useSession();
  const role = profile.activeContext?.role ?? "";

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <button
            type="button"
            title={`${profile.user.displayName} · ${roleLabel(role)}`}
            aria-label={`Account menu for ${profile.user.displayName}`}
            className="relative size-10 rounded-full bg-primary text-xs font-semibold text-primary-foreground transition-opacity hover:opacity-85"
          />
        }
      >
        {initials(profile.user.displayName)}
        <span
          aria-hidden
          className={`absolute -right-0.5 -bottom-0.5 size-3 rounded-full ring-2 ring-background ${HUE_DOT[roleHue(role)]}`}
        />
      </DropdownMenuTrigger>
      <DropdownMenuContent side="right" align="end" className="w-60">
        <div className="space-y-1.5 px-2 py-2">
          <p className="truncate text-sm font-medium">
            {profile.user.displayName}
          </p>
          <p className="truncate text-xs text-muted-foreground">
            {profile.user.email}
          </p>
          <RoleBadge role={role} />
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
  );
}

/** Slim desktop navigation: icons only, labels on hover. */
export function AppRail() {
  const { has } = useSession();
  const pathname = usePathname();
  const visible = NAV.filter((item) => has(item.capability));
  const main = visible.filter((item) => item.group === "main");
  const manage = visible.filter((item) => item.group === "manage");
  const isActive = (item: NavItem) => isNavActive(item, pathname);

  return (
    <aside className="hidden w-16 shrink-0 flex-col items-center gap-3 border-r bg-secondary/40 py-3 lg:flex">
      <Link
        href="/catalog"
        aria-label="Askalytics home"
        className="flex size-10 items-center justify-center rounded-lg bg-primary text-sm font-semibold text-primary-foreground"
      >
        A
        <span
          aria-hidden
          className="motion-safe-anim ml-0.5 h-3.5 w-[2px] bg-signal"
          style={{ animation: "caret-blink 1.1s steps(1) infinite" }}
        />
      </Link>

      <OrganizationChip />

      <nav
        aria-label="Main"
        className="flex flex-1 flex-col items-center gap-1 pt-2"
      >
        {main.map((item) => (
          <RailLink key={item.href} item={item} active={isActive(item)} />
        ))}
        {manage.length > 0 ? (
          <>
            <span aria-hidden className="my-2 h-px w-6 bg-border" />
            {manage.map((item) => (
              <RailLink key={item.href} item={item} active={isActive(item)} />
            ))}
          </>
        ) : null}
      </nav>

      <AccountMenu />
    </aside>
  );
}
