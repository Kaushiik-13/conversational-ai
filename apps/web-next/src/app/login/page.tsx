import type { Metadata } from "next";
import { BrandLogo } from "@/components/brand-logo";
import { ConversationDemo } from "@/components/conversation-demo";
import { LoginForm } from "@/components/login-form";
import { BRAND } from "@/lib/brand";

export const metadata: Metadata = { title: `Sign in · ${BRAND.name}` };

export default function LoginPage() {
  return (
    <main className="grid min-h-screen grid-cols-1 lg:grid-cols-[minmax(420px,5fr)_6fr]">
      <section className="flex min-w-0 flex-col px-6 py-8 sm:px-12 lg:px-20">
        <BrandLogo />
        <div className="flex flex-1 items-center py-12">
          <LoginForm />
        </div>
        <p className="text-xs text-muted-foreground">
          Access is monitored and security actions are audited.
        </p>
      </section>

      <section className="relative hidden flex-col justify-center gap-8 border-l bg-secondary/60 px-14 lg:flex">
        <div
          aria-hidden
          className="absolute inset-0 bg-[radial-gradient(var(--border)_1px,transparent_1px)] bg-[size:22px_22px]"
        />
        <div className="relative space-y-3">
          <p className="font-mono text-[11px] tracking-wide text-muted-foreground uppercase">
            {BRAND.tagline}
          </p>
          <h1 className="max-w-lg font-display text-5xl leading-[1.05] text-balance">
            Ask in plain words. See exactly how it was understood.
          </h1>
        </div>
        <div className="relative">
          <ConversationDemo />
        </div>
      </section>
    </main>
  );
}
