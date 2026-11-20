import type { Metadata } from "next";
import { BrandLogo } from "@/components/brand-logo";
import { ChangePasswordForm } from "@/components/change-password-form";
import { BRAND } from "@/lib/brand";

export const metadata: Metadata = {
  title: `Set your password · ${BRAND.name}`,
};

export default function ChangePasswordPage() {
  return (
    <main className="h-dvh overflow-x-hidden overflow-y-auto">
      <div className="mx-auto flex min-h-full max-w-6xl flex-col border-x">
        <header className="flex h-14 shrink-0 items-center justify-between border-b px-6 lg:px-10">
          <BrandLogo />
          <span className="font-mono text-xs text-muted-foreground">
            Security
          </span>
        </header>

        <div className="grid flex-1 lg:grid-cols-[1.4fr_1fr]">
          <section className="hidden flex-col justify-center space-y-6 border-r p-10 lg:flex">
            <h1 className="text-[clamp(2.5rem,min(6vw,9vh),5.5rem)] leading-[0.95] font-semibold tracking-[-0.045em] text-balance">
              Make it yours.
              <br />
              <span className="text-muted-foreground">
                Only you should know it.
              </span>
            </h1>
            <p className="max-w-md text-lg text-muted-foreground">
              The password you were given is temporary. Pick one only you know,
              and use it every time you sign in.
            </p>
          </section>

          <section className="flex items-center p-6 lg:p-10">
            <div className="mx-auto w-full max-w-sm lg:mx-0">
              <ChangePasswordForm />
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}
