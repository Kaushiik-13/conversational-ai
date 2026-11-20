"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, Eye, EyeOff, Loader2 } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { login } from "@/lib/api";

export function LoginForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (loading) return;
    if (password.length < 12) {
      setError("Your password must be at least 12 characters.");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const profile = await login(email.trim(), password);
      router.push(profile.mustChangePassword ? "/change-password" : "/");
    } catch (failure) {
      setError(
        failure instanceof Error
          ? failure.message
          : "Check your email and password, then try again.",
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={onSubmit} noValidate className="w-full space-y-6">
      <div className="space-y-4">
        <div className="flex items-center gap-3 max-md:snug:hidden">
          <span
            aria-hidden
            className="flex size-11 items-center justify-center rounded-xl border bg-secondary font-mono text-lg leading-none"
          >
            &gt;
            <span
              className="motion-safe-anim ml-0.5 h-4 w-[2px] bg-signal"
              style={{ animation: "caret-blink 1.1s steps(1) infinite" }}
            />
          </span>
          <span className="inline-flex items-center gap-2 rounded-full border px-3 py-1 font-mono text-[11px] tracking-wide text-muted-foreground uppercase">
            <span className="relative flex size-1.5">
              <span
                className="motion-safe-anim absolute inline-flex size-full rounded-full bg-signal opacity-60"
                style={{
                  animation: "ping 1.8s cubic-bezier(0,0,0.2,1) infinite",
                }}
              />
              <span className="relative inline-flex size-1.5 rounded-full bg-signal" />
            </span>
            Secure sign-in
          </span>
        </div>
        <div className="space-y-1.5">
          <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">
            {["Welcome", "back"].map((word, index) => (
              <span
                key={word}
                className="motion-safe-anim mr-[0.25em] inline-block last:mr-0"
                style={{
                  animation: `word-rise 650ms cubic-bezier(0.2, 0.8, 0.2, 1) ${
                    index * 110
                  }ms both`,
                }}
              >
                {word}
              </span>
            ))}
          </h2>
          <span
            aria-hidden
            className="motion-safe-anim block h-[3px] w-12 origin-left bg-signal"
            style={{ animation: "draw-line 700ms ease-out 450ms both" }}
          />
          <p
            className="motion-safe-anim text-sm text-muted-foreground"
            style={{ animation: "word-rise 650ms ease-out 350ms both" }}
          >
            Sign in with the account your organization gave you.
          </p>
        </div>
      </div>

      {error ? (
        <Alert variant="destructive" role="alert">
          <AlertCircle />
          <AlertTitle>Couldn&apos;t sign you in</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      <div className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            type="email"
            autoComplete="username"
            placeholder="you@company.com"
            className="h-10"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="password">Password</Label>
          <div className="relative">
            <Input
              id="password"
              type={showPassword ? "text" : "password"}
              autoComplete="current-password"
              className="h-10 pr-10"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
            />
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="absolute top-0.5 right-0.5 size-9 text-muted-foreground"
              aria-label={showPassword ? "Hide password" : "Show password"}
              onClick={() => setShowPassword((value) => !value)}
            >
              {showPassword ? <EyeOff /> : <Eye />}
            </Button>
          </div>
        </div>
      </div>

      <Button
        type="submit"
        className="h-10 w-full"
        disabled={loading || !email || !password}
      >
        {loading ? <Loader2 className="animate-spin" /> : null}
        {loading ? "Signing in" : "Continue"}
      </Button>
    </form>
  );
}
