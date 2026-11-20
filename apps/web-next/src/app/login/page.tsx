import type { Metadata } from "next";
import { AnimatedCaption } from "@/components/animated-caption";
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
    <main className="h-dvh overflow-x-hidden overflow-y-auto">
      <div className="mx-auto flex min-h-full max-w-6xl flex-col border-x">
        <header className="flex h-14 shrink-0 items-center justify-between border-b px-6 lg:px-10">
          <BrandLogo />
          <span className="font-mono text-xs text-muted-foreground">
            Preview
          </span>
        </header>

        <div className="grid flex-1 max-md:content-center md:grid-cols-[1.25fr_1fr] lg:grid-cols-[1.4fr_1fr] lg:grid-rows-[auto_1fr]">
          <section className="flex min-w-0 flex-col justify-center space-y-6 border-b p-6 md:border-r lg:justify-start lg:border-b-0 lg:p-10 short:lg:p-6">
            <h1 className="text-[clamp(2.5rem,min(5vw,9vh),5.5rem)] lg:text-[clamp(2.5rem,min(6vw,9vh),5.5rem)] leading-[0.95] font-semibold tracking-[-0.045em] text-balance">
              Ask your data.
              <br />
              <span className="text-muted-foreground">
                Verify every answer.
              </span>
            </h1>
            <AnimatedCaption />
            <p className="max-w-md text-lg text-muted-foreground short:hidden">
              {BRAND.description}
            </p>
          </section>

          <section className="flex items-center p-6 md:border-b lg:row-span-2 lg:border-b-0 lg:border-l lg:p-10">
            <LoginForm />
          </section>

          <div className="hidden min-w-0 p-6 tiny:hidden max-lg:cramped:hidden md:col-span-2 md:block lg:col-span-1 lg:col-start-1 lg:row-start-2 lg:self-center lg:p-10 lg:pt-0 short:lg:p-6 short:lg:pt-0">
            <ConversationDemo />
          </div>
        </div>

        <footer className="hidden shrink-0 border-t sm:grid sm:grid-cols-3 short:hidden">
          {PRINCIPLES.map(([title, text]) => (
            <div
              key={title}
              className="space-y-0.5 p-4 sm:border-r sm:last:border-r-0 lg:px-10"
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
