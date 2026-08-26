"use client";

import { AdminSidebar } from "@/components/admin/admin-sidebar";
import { AdminHeader } from "@/components/admin/admin-header";
import { useAdminAuthStore, checkCanAccessAdmin } from "@/lib/store/use-admin-auth-store";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const isLoginPage = pathname
    ? pathname.includes("/admin/login")
    : typeof window !== "undefined"
      ? window.location.pathname.includes("/admin/login")
      : false;
  // /admin/handoff restores a super_admin session from a handoff code
  // (returning from store impersonation). It has no token yet when it
  // loads, so it must run outside this guard or the auth check below
  // redirects to /admin/login before the handoff page's own effect can
  // consume the code and establish the session.
  const isHandoffPage = pathname
    ? pathname.includes("/admin/handoff")
    : typeof window !== "undefined"
      ? window.location.pathname.includes("/admin/handoff")
      : false;
  const bypassGuard = isLoginPage || isHandoffPage;

  const {
    user,
    initSession,
    loading: authLoading,
    token: _token,
  } = useAdminAuthStore();
  const router = useRouter();
  const [checking, setChecking] = useState(true);

  // Summary is handled by useAdminSummary hook automatically

  useEffect(() => {
    const checkAuth = async () => {
      if (bypassGuard) {
        setChecking(false);
        return;
      }

      // The access token lives in memory only, so it never survives a page
      // reload - attempt to restore the session via the HttpOnly refresh
      // cookie directly instead of checking a token that was never persisted.
      if (!user) {
        await initSession();
      }
      setChecking(false);
    };
    checkAuth();
  }, [user, initSession, bypassGuard]);

  useEffect(() => {
    if (bypassGuard) return;

    if (!checking && (!user || !checkCanAccessAdmin(user.role))) {
      router.push("/admin/login");
    }
  }, [user, checking, router, bypassGuard]);

  // If on login or handoff page, just render children without further checks
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

  if (!user || !checkCanAccessAdmin(user.role)) {
    return null;
  }

  return (
    <div className="flex h-screen bg-slate-50 dark:bg-slate-950 overflow-hidden">
      <AdminSidebar />

      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Admin Header */}
        <AdminHeader />

        {/* Admin Main Area */}
        <main className="flex-1 overflow-y-auto bg-slate-50 dark:bg-slate-950">
          <div className="p-4 lg:p-8 max-w-[1600px] mx-auto">{children}</div>
        </main>
      </div>
    </div>
  );
}
