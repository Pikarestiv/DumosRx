"use client";

import { Menu, Zap, Globe, Loader2, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useAdminStore } from "@/lib/store/use-admin-store";
import { useAdminSummary } from "@/lib/api/admin-hooks";
import { ModeToggle } from "@/components/mode-toggle";
import { AdminHeaderSearch } from "./admin-header-search";
import { AdminHeaderNotifications } from "./admin-header-notifications";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Sheet, SheetContent, SheetTrigger, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { sidebarItems } from "./admin-sidebar";
import { cn } from "@/lib/utils";
import { useAdminAuthStore } from "@/lib/store/use-admin-auth-store";
import { useState } from "react";

export function AdminHeader() {
  const { latency } = useAdminStore();
  const { isLoading: summaryLoading } = useAdminSummary();
  const pathname = usePathname();
  const { logout } = useAdminAuthStore();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  return (
    <header className="h-20 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between px-4 lg:px-8 z-10 shadow-sm">
      <div className="flex items-center gap-4 flex-1">
        <div className="lg:hidden flex items-center mr-2">
          <Image 
            src="/logo.png" 
            alt="DumosRx" 
            width={120} 
            height={32} 
            className="h-8 w-auto [filter:brightness(0)_saturate(100%)_invert(32%)_sepia(94%)_saturate(2975%)_hue-rotate(227deg)_brightness(96%)_contrast(92%)] dark:[filter:brightness(0)_invert(1)]" 
          />
        </div>
        
        <div className="hidden md:block">
          <AdminHeaderSearch />
        </div>

        <div className="hidden lg:flex items-center gap-2 ml-4">
          {(latency > 0 || summaryLoading) && (
            <Badge
              variant="outline"
              className={`${latency > 200 ? "bg-amber-500/10 text-amber-500 border-amber-500/20" : "bg-green-500/10 text-green-500 border-green-500/20"} gap-1 font-bold`}
            >
              {summaryLoading ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <Zap className="h-3 w-3 fill-current" />
              )}
              Cloud API: {summaryLoading ? "Checking..." : `${latency}ms`}
            </Badge>
          )}
          <Badge
            variant="outline"
            className="bg-indigo-500/10 text-indigo-500 border-indigo-500/20 gap-1 font-bold"
          >
            <Globe className="h-3 w-3" />
            Production
          </Badge>
        </div>
      </div>

      <div className="flex items-center gap-2 sm:gap-4">
        <ModeToggle />
        <AdminHeaderNotifications />

        <Sheet open={isMobileMenuOpen} onOpenChange={setIsMobileMenuOpen}>
          <SheetTrigger asChild>
            <Button className="lg:hidden" variant="ghost" size="icon">
              <Menu className="h-6 w-6 text-slate-500 dark:text-slate-400" />
            </Button>
          </SheetTrigger>
          <SheetContent side="left" className="w-[280px] sm:w-[300px] p-0 bg-slate-50 dark:bg-slate-950 border-r-slate-200 dark:border-r-slate-800 flex flex-col h-full">
            <SheetHeader className="p-6 border-b border-slate-200 dark:border-slate-800 text-left">
              <SheetTitle className="flex items-center gap-3">
                <Image 
                  src="/logo.png" 
                  alt="DumosRx" 
                  width={120} 
                  height={32} 
                  className="h-8 w-auto"
                  style={{ filter: "brightness(0) saturate(100%) invert(32%) sepia(94%) saturate(2975%) hue-rotate(227deg) brightness(96%) contrast(92%)" }}
                />
              </SheetTitle>
            </SheetHeader>
            <div className="flex-1 overflow-y-auto py-6 px-4 space-y-1">
              {sidebarItems.map((item) => {
                const isActive = pathname === item.href || (item.href !== "/admin" && pathname?.startsWith(item.href));
                const Icon = item.icon;
                return (
                  <Link
                    key={item.id}
                    href={item.href}
                    onClick={() => setIsMobileMenuOpen(false)}
                    className={cn(
                      "flex items-center gap-3 px-3 py-3 rounded-xl transition-all font-bold text-sm",
                      isActive
                        ? "bg-indigo-50 dark:bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 shadow-sm"
                        : "text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-900 hover:text-slate-900 dark:hover:text-slate-200"
                    )}
                  >
                    <Icon className="h-5 w-5" />
                    {item.name}
                  </Link>
                );
              })}
            </div>
            <div className="p-4 border-t border-slate-200 dark:border-slate-800">
              <Button 
                onClick={logout} 
                variant="outline" 
                className="w-full justify-start text-rose-500 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-500/10 border-rose-200 dark:border-rose-900 rounded-xl h-12"
              >
                <LogOut className="h-5 w-5 mr-3" />
                Sign Out
              </Button>
            </div>
          </SheetContent>
        </Sheet>
      </div>
    </header>
  );
}
