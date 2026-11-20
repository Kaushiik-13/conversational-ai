"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, ArrowRight, Eye, EyeOff, Loader2 } from "lucide-react";
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
      await login(email.trim(), password);
      router.push("/");
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
    <form onSubmit={onSubmit} noValidate className="w-full max-w-sm space-y-8">
      <div className="space-y-2">
        <h2 className="font-display text-5xl leading-none">Welcome back</h2>
        <p className="text-muted-foreground">
          Sign in with the account your organization gave you.
        </p>
      </div>

      {error ? (
        <Alert variant="destructive" role="alert">
          <AlertCircle />
          <AlertTitle>Couldn&apos;t sign you in</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      <div className="space-y-5">
        <div className="space-y-2">
          <Label htmlFor="email">Work email</Label>
          <Input
            id="email"
            type="email"
            autoComplete="username"
            placeholder="you@company.com"
            className="h-11"
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
              className="h-11 pr-11"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
            />
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="absolute top-1 right-1 size-9 text-muted-foreground"
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
        size="lg"
        className="h-11 w-full"
        disabled={loading || !email || !password}
      >
        {loading ? <Loader2 className="animate-spin" /> : null}
        {loading ? "Signing in" : "Continue"}
        {loading ? null : <ArrowRight />}
      </Button>
    </form>
  );
}
