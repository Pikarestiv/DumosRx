"use client";

import { AdminSidebar } from "@/components/admin/admin-sidebar";
import { ModeToggle } from "@/components/mode-toggle";
import { 
  Bell, 
  Search, 
  Menu,
  ShieldCheck,
  Zap,
  Globe
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";
import { useAdminAuthStore } from "@/lib/store/use-admin-auth-store";
import { useRouter, usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user, fetchUser, loading: authLoading, token } = useAdminAuthStore();
  const router = useRouter();
  const pathname = usePathname();
  const [checking, setChecking] = useState(true);

  const isLoginPage = pathname?.includes("/admin/login");

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

    if (!checking && (!user || user.role !== 'super_admin')) {
      router.push("/admin/login");
    }
  }, [user, checking, router, isLoginPage]);

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

  if (!user || user.role !== 'super_admin') {
    return null;
  }

  return (
    <div className="flex h-screen bg-slate-50 dark:bg-slate-950 overflow-hidden">
      <AdminSidebar />

      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Admin Header */}
        <header className="h-20 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between px-8 z-10 shadow-sm">
          <div className="flex items-center gap-4 flex-1">
            <div className="relative w-full max-w-md hidden md:block group">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 group-focus-within:text-indigo-500 transition-colors" />
              <Input
                placeholder="Search pharmacies, users, or transactions..."
                className="pl-10 bg-slate-100 dark:bg-slate-800 border-none focus-visible:ring-2 focus-visible:ring-indigo-500 transition-all"
              />
            </div>
            
            <div className="hidden lg:flex items-center gap-2 ml-4">
                <Badge variant="outline" className="bg-green-500/10 text-green-500 border-green-500/20 gap-1 font-bold">
                    <Zap className="h-3 w-3 fill-current" />
                    Cloud API: 24ms
                </Badge>
                <Badge variant="outline" className="bg-indigo-500/10 text-indigo-500 border-indigo-500/20 gap-1 font-bold">
                    <Globe className="h-3 w-3" />
                    Production
                </Badge>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <ModeToggle />
            
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="relative hover:bg-indigo-50 dark:hover:bg-indigo-500/10">
                  <Bell className="h-5 w-5 text-slate-500" />
                  <span className="absolute top-2 right-2 w-2 h-2 bg-indigo-500 rounded-full border-2 border-white dark:border-slate-900" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-80 p-0 border-slate-200 dark:border-slate-800">
                <div className="p-4 bg-indigo-600 rounded-t-lg">
                    <h3 className="text-white font-bold">Platform Alerts</h3>
                    <p className="text-indigo-100 text-xs">3 critical issues requiring attention</p>
                </div>
                <div className="max-h-[300px] overflow-y-auto">
                  <div className="p-4 hover:bg-slate-50 dark:hover:bg-slate-800/50 cursor-pointer border-b border-slate-100 dark:border-slate-800">
                    <div className="flex items-center gap-2 mb-1">
                      <Badge className="bg-red-500 text-[10px]">High Load</Badge>
                      <span className="text-[10px] text-slate-400 ml-auto">5m ago</span>
                    </div>
                    <p className="text-sm font-bold dark:text-white">API Gateway Spike</p>
                    <p className="text-xs text-slate-500 mt-1">Traffic increased by 400% in the last 10 minutes.</p>
                  </div>
                  <div className="p-4 hover:bg-slate-50 dark:hover:bg-slate-800/50 cursor-pointer">
                    <div className="flex items-center gap-2 mb-1">
                      <Badge className="bg-indigo-500 text-[10px]">Security</Badge>
                      <span className="text-[10px] text-slate-400 ml-auto">1h ago</span>
                    </div>
                    <p className="text-sm font-bold dark:text-white">New Admin Login</p>
                    <p className="text-xs text-slate-500 mt-1">A new administrator account was authorized from Lagos, NG.</p>
                  </div>
                </div>
                <DropdownMenuSeparator />
                <div className="p-2">
                    <Button variant="ghost" className="w-full text-xs font-bold text-indigo-600 hover:text-indigo-700 hover:bg-indigo-50">View System Logs</Button>
                </div>
              </DropdownMenuContent>
            </DropdownMenu>

            <Button className="lg:hidden" variant="ghost" size="icon">
              <Menu className="h-6 w-6 text-slate-500" />
            </Button>
          </div>
        </header>

        {/* Admin Main Area */}
        <main className="flex-1 overflow-y-auto bg-slate-50 dark:bg-slate-950">
          <div className="p-8 max-w-[1600px] mx-auto">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
