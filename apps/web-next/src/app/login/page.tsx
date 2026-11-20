import type { Metadata } from "next";
import { BrandLogo } from "@/components/brand-logo";
import { ConversationDemo } from "@/components/conversation-demo";
import { LoginForm } from "@/components/login-form";
import { BRAND } from "@/lib/brand";

export const metadata: Metadata = { title: `Sign in · ${BRAND.name}` };

const PRINCIPLES = [
  ["Read-only", "Questions never change your data."],
  ["Scoped to you", "Organization and role limits apply to every answer."],
  ["Show the work", "See how each question was understood."],
] as const;

export default function LoginPage() {
  return (
    <main className="min-h-screen">
      <div className="mx-auto flex min-h-screen max-w-6xl flex-col border-x">
        <header className="flex h-14 items-center justify-between border-b px-6 lg:px-10">
          <BrandLogo />
          <span className="font-mono text-xs text-muted-foreground">
            Preview
          </span>
        </header>

        <div className="grid flex-1 md:grid-cols-[1.25fr_1fr] lg:grid-cols-[1.4fr_1fr]">
          <section className="min-w-0 space-y-6 border-b p-6 md:border-r lg:border-b-0 lg:p-10">
            <h1 className="text-[clamp(2.75rem,7vw,5.5rem)] leading-[0.95] font-semibold tracking-[-0.045em] text-balance">
              Ask your data.
              <br />
              <span className="text-muted-foreground">
                Verify every answer.
              </span>
            </h1>
            <p className="max-w-md text-lg text-muted-foreground">
              {BRAND.description}
            </p>
          </section>

          <section className="flex items-center p-6 md:border-b lg:row-span-2 lg:border-b-0 lg:border-l lg:p-10">
            <LoginForm />
          </section>

          <div className="hidden min-w-0 p-6 md:col-span-2 md:block lg:col-span-1 lg:col-start-1 lg:row-start-2 lg:p-10 lg:pt-0">
            <ConversationDemo />
          </div>
        </div>

        <footer className="grid border-t sm:grid-cols-3">
          {PRINCIPLES.map(([title, text]) => (
            <div
              key={title}
              className="space-y-1 border-b p-6 last:border-b-0 sm:border-r sm:border-b-0 sm:last:border-r-0 lg:px-10"
            >
              <p className="font-mono text-xs uppercase">{title}</p>
              <p className="text-sm text-muted-foreground">{text}</p>
            </div>
          ))}
        </footer>
      </div>
    </main>
  );
}
