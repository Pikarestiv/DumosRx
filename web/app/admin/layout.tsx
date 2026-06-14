"use client";

import { AdminSidebar } from "@/components/admin/admin-sidebar";
import { AdminHeader } from "@/components/admin/admin-header";
import { useAdminAuthStore } from "@/lib/store/use-admin-auth-store";
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

  const {
    user,
    fetchUser,
    loading: authLoading,
    token: _token,
  } = useAdminAuthStore();
  const router = useRouter();
  const [checking, setChecking] = useState(true);

  // Summary is handled by useAdminSummary hook automatically

  useEffect(() => {
    const checkAuth = async () => {
      if (isLoginPage) {
        setChecking(false);
        return;
      }

      if (!user) {
        await fetchUser();
      }
      setChecking(false);
    };
    checkAuth();
  }, [user, fetchUser, isLoginPage]);

  useEffect(() => {
    if (isLoginPage) return;

    if (!checking && (!user || user.role !== "super_admin")) {
      router.push("/admin/login");
    }
  }, [user, checking, router, isLoginPage]);

  // If on login page, just render children without further checks
  if (isLoginPage) {
    return <>{children}</>;
  }

  if (checking || authLoading) {
    return (
      <div className="flex h-screen items-center justify-center bg-slate-950">
        <Loader2 className="h-10 w-10 text-indigo-500 animate-spin" />
      </div>
    );
  }

  if (!user || user.role !== "super_admin") {
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
