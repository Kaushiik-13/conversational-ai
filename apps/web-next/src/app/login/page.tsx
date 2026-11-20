import type { Metadata } from "next";
import { BrandLogo } from "@/components/brand-logo";
import { LoginForm } from "@/components/login-form";
import { BRAND } from "@/lib/brand";

export const metadata: Metadata = { title: `Sign in · ${BRAND.name}` };

export default function LoginPage() {
  return (
    <main className="grid min-h-screen lg:grid-cols-2">
      <section className="hidden flex-col justify-between bg-primary p-10 text-primary-foreground lg:flex">
        <BrandLogo className="[&>span:first-child]:bg-primary-foreground [&>span:first-child]:text-primary" />
        <div className="space-y-4">
          <h1 className="text-4xl font-semibold leading-tight">
            {BRAND.tagline}
          </h1>
          <p className="max-w-md text-primary-foreground/80">
            {BRAND.description}
          </p>
        </div>
        <p className="text-sm text-primary-foreground/70">
          Organization and role access is applied before any result is shown.
        </p>
      </section>
      <section className="flex flex-col items-center justify-center gap-8 p-6">
        <BrandLogo className="lg:hidden" />
        <LoginForm />
      </section>
    </main>
  );
}
