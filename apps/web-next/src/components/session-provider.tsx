"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useRouter } from "next/navigation";
import {
  ApiError,
  getProfile,
  logout,
  selectOrganization,
  type AuthProfile,
} from "@/lib/api";

interface SessionValue {
  profile: AuthProfile;
  /** Increases every time the organization changes so pages can reload data. */
  orgVersion: number;
  has: (capability: string) => boolean;
  switchOrganization: (organizationId: string) => Promise<void>;
  signOut: () => Promise<void>;
}

const SessionContext = createContext<SessionValue | null>(null);

export function useSession(): SessionValue {
  const value = useContext(SessionContext);
  if (!value)
    throw new Error("useSession must be used inside SessionProvider.");
  return value;
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [profile, setProfile] = useState<AuthProfile | null>(null);
  const [orgVersion, setOrgVersion] = useState(0);

  useEffect(() => {
    let cancelled = false;
    getProfile()
      .then((result) => {
        if (cancelled) return;
        if (result.mustChangePassword) {
          router.replace("/change-password");
          return;
        }
        setProfile(result);
      })
      .catch((error) => {
        if (cancelled) return;
        if (error instanceof ApiError && error.status === 401) {
          router.replace("/login");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [router]);

  const switchOrganization = useCallback(async (organizationId: string) => {
    const next = await selectOrganization(organizationId);
    setProfile(next);
    setOrgVersion((value) => value + 1);
  }, []);

  const signOut = useCallback(async () => {
    await logout().catch(() => undefined);
    router.replace("/login");
  }, [router]);

  const value = useMemo<SessionValue | null>(
    () =>
      profile
        ? {
            profile,
            orgVersion,
            has: (capability) => profile.capabilities.includes(capability),
            switchOrganization,
            signOut,
          }
        : null,
    [profile, orgVersion, switchOrganization, signOut],
  );

  if (!value) {
    return (
      <div
        className="flex min-h-dvh items-center justify-center text-sm text-muted-foreground"
        role="status"
      >
        Loading your workspace…
      </div>
    );
  }

  return (
    <SessionContext.Provider value={value}>{children}</SessionContext.Provider>
  );
}
