"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, Check, Circle, Eye, EyeOff, Loader2 } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  ApiError,
  changePassword,
  getProfile,
  logout,
  type AuthProfile,
} from "@/lib/api";

const MIN_LENGTH = 12;

function PasswordField({
  id,
  label,
  value,
  onChange,
  autoComplete,
  autoFocus,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  autoComplete: string;
  autoFocus?: boolean;
}) {
  const [visible, setVisible] = useState(false);
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <div className="relative">
        <Input
          id={id}
          type={visible ? "text" : "password"}
          autoComplete={autoComplete}
          autoFocus={autoFocus}
          className="h-10 pr-10"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          required
        />
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="absolute top-0.5 right-0.5 size-9 text-muted-foreground"
          aria-label={visible ? `Hide ${label}` : `Show ${label}`}
          onClick={() => setVisible((value) => !value)}
        >
          {visible ? <EyeOff /> : <Eye />}
        </Button>
      </div>
    </div>
  );
}

function Rule({ met, children }: { met: boolean; children: string }) {
  return (
    <li
      className={`flex items-center gap-2 text-sm ${
        met ? "text-foreground" : "text-muted-foreground"
      }`}
    >
      {met ? (
        <Check className="size-4 text-signal" aria-hidden />
      ) : (
        <Circle className="size-4" aria-hidden />
      )}
      {children}
      <span className="sr-only">{met ? "(done)" : "(not yet)"}</span>
    </li>
  );
}

export function ChangePasswordForm() {
  const router = useRouter();
  const [profile, setProfile] = useState<AuthProfile | null>(null);
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    getProfile()
      .then(setProfile)
      .catch((failure) => {
        if (failure instanceof ApiError && failure.status === 401) {
          router.replace("/login");
        }
      });
  }, [router]);

  const longEnough = next.length >= MIN_LENGTH;
  const different = next.length > 0 && next !== current;
  const matches = confirm.length > 0 && confirm === next;
  const ready = current.length > 0 && longEnough && different && matches;

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!ready || loading) return;
    setLoading(true);
    setError("");
    try {
      await changePassword(current, next);
      router.replace("/");
    } catch (failure) {
      setError(
        failure instanceof Error
          ? failure.message
          : "Your password could not be changed. Try again.",
      );
    } finally {
      setLoading(false);
    }
  }

  async function onSignOut() {
    await logout().catch(() => undefined);
    router.replace("/login");
  }

  if (!profile) return null;

  const forced = profile.mustChangePassword;

  return (
    <form onSubmit={onSubmit} noValidate className="w-full space-y-6">
      <div className="space-y-1.5">
        <h2 className="text-2xl font-semibold tracking-tight">
          {forced ? "Set your password" : "Change password"}
        </h2>
        <p className="text-sm text-muted-foreground">
          {forced
            ? "For your security, choose your own password before you continue. You will use it from now on."
            : "Choose a new password. Your other devices will be signed out."}
        </p>
      </div>

      {error ? (
        <Alert variant="destructive" role="alert">
          <AlertCircle />
          <AlertTitle>Couldn&apos;t change your password</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      <div className="space-y-4">
        <PasswordField
          id="current-password"
          label={forced ? "Temporary password" : "Current password"}
          value={current}
          onChange={setCurrent}
          autoComplete="current-password"
          autoFocus
        />
        <PasswordField
          id="new-password"
          label="New password"
          value={next}
          onChange={setNext}
          autoComplete="new-password"
        />
        <PasswordField
          id="confirm-password"
          label="Confirm new password"
          value={confirm}
          onChange={setConfirm}
          autoComplete="new-password"
        />
      </div>

      <ul className="space-y-1.5" aria-label="Password requirements">
        <Rule met={longEnough}>{`At least ${MIN_LENGTH} characters`}</Rule>
        <Rule met={different}>Different from your current password</Rule>
        <Rule met={matches}>Both new passwords match</Rule>
      </ul>

      <div className="space-y-3">
        <Button
          type="submit"
          className="h-10 w-full"
          disabled={!ready || loading}
        >
          {loading ? <Loader2 className="animate-spin" /> : null}
          {loading ? "Saving" : "Save password"}
        </Button>
        <Button
          type="button"
          variant="ghost"
          className="w-full text-muted-foreground"
          onClick={onSignOut}
        >
          Sign out
        </Button>
      </div>
    </form>
  );
}
