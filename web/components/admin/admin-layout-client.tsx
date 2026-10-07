"use client";

import { AdminSidebar } from "@/components/admin/admin-sidebar";
import { AdminHeader } from "@/components/admin/admin-header";
import { useAdminAuthStore, checkCanAccessAdmin } from "@/lib/store/use-admin-auth-store";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";

const GUARD_BYPASS_PATHS = ["/admin/login", "/admin/handoff"];

function bypassesGuard(pathname: string | null): boolean {
  const activePath =
    pathname || (typeof window !== "undefined" ? window.location.pathname : "");

  return GUARD_BYPASS_PATHS.some((bypassPath) => activePath.includes(bypassPath));
}

export function AdminLayoutClient({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const bypassGuard = bypassesGuard(pathname);

  const {
    user,
    initSession,
    loading: authLoading,
    sessionVerified,
    token: _token,
  } = useAdminAuthStore();
  const router = useRouter();
  const [checking, setChecking] = useState(true);
  const verifyingRef = useRef(false);

  useEffect(() => {
    const checkAuth = async () => {
      if (bypassGuard) {
        verifyingRef.current = false;
        setChecking(false);
        return;
      }

      if (!sessionVerified) {
        verifyingRef.current = true;
        setChecking(true);
        try {
          await initSession();
        } finally {
          verifyingRef.current = false;
        }
      }
      setChecking(false);
    };
    void checkAuth();
  }, [sessionVerified, initSession, bypassGuard]);

  useEffect(() => {
    if (bypassGuard || verifyingRef.current) return;

    if (!checking && (!sessionVerified || !user || !checkCanAccessAdmin(user))) {
      router.push("/admin/login");
    }
  }, [user, sessionVerified, checking, router, bypassGuard]);

  if (bypassGuard) {
    return <>{children}</>;
  }

  if (checking || authLoading) {
    return (
      <div className="flex h-screen items-center justify-center bg-slate-950">
        <Loader2 className="h-10 w-10 text-indigo-500 animate-spin" />
      </div>
    );
  }

  if (!sessionVerified || !user || !checkCanAccessAdmin(user)) {
    return null;
  }

  return (
    <div className="flex h-screen bg-slate-50 dark:bg-slate-950 overflow-hidden">
      <AdminSidebar />

      <div className="flex-1 flex flex-col overflow-hidden">
        <AdminHeader />

        <main className="flex-1 overflow-y-auto bg-slate-50 dark:bg-slate-950">
          <div className="p-4 lg:p-8 max-w-[1600px] mx-auto">{children}</div>
        </main>
      </div>
    </div>
  );
}
