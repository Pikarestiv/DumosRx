"use client";

import { Menu, Zap, Globe, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useAdminStore } from "@/lib/store/use-admin-store";
import { useAdminSummary } from "@/lib/api/admin-hooks";
import { ModeToggle } from "@/components/mode-toggle";
import { AdminHeaderSearch } from "./admin-header-search";
import { AdminHeaderNotifications } from "./admin-header-notifications";

export function AdminHeader() {
  const { latency } = useAdminStore();
  const { isLoading: summaryLoading } = useAdminSummary();

  return (
    <header className="h-20 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between px-8 z-10 shadow-sm">
      <div className="flex items-center gap-4 flex-1">
        <AdminHeaderSearch />

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

      <div className="flex items-center gap-4">
        <ModeToggle />
        <AdminHeaderNotifications />

        <Button className="lg:hidden" variant="ghost" size="icon">
          <Menu className="h-6 w-6 text-slate-500" />
        </Button>
      </div>
    </header>
  );
}
