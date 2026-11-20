"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ApiError, getProfile, logout, type AuthProfile } from "@/lib/api";

export function HomeView() {
  const router = useRouter();
  const [profile, setProfile] = useState<AuthProfile | null>(null);

  useEffect(() => {
    getProfile()
      .then((result) => {
        if (result.mustChangePassword) {
          router.replace("/change-password");
          return;
        }
        setProfile(result);
      })
      .catch((error) => {
        if (error instanceof ApiError && error.status === 401) {
          router.replace("/login");
        }
      });
  }, [router]);

  async function onLogout() {
    await logout().catch(() => undefined);
    router.replace("/login");
  }

  if (!profile) return null;

  return (
    <main className="mx-auto flex min-h-screen max-w-xl items-center p-6">
      <Card className="w-full">
        <CardHeader>
          <CardTitle>Welcome, {profile.user.displayName}</CardTitle>
          <CardDescription>
            {profile.activeContext
              ? `${profile.activeContext.organizationName} · ${profile.activeContext.role}`
              : "No organization selected"}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex items-center justify-between gap-4">
          <p className="text-sm text-muted-foreground">
            The chat screen is coming next.
          </p>
          <Button variant="outline" onClick={onLogout}>
            Sign out
          </Button>
        </CardContent>
      </Card>
    </main>
  );
}
