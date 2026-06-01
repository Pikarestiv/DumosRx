import { Search, Filter, Loader2, Check } from "lucide-react";
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

interface PharmacyToolbarProps {
  search: string;
  onSearchChange: (value: string) => void;
  statusFilter: string;
  onStatusFilterChange: (status: string) => void;
  planFilter: string;
  onPlanFilterChange: (plan: string) => void;
  isLoading: boolean;
  totalShown: number;
  totalCount: number;
}

export function PharmacyToolbar({
  search,
  onSearchChange,
  statusFilter,
  onStatusFilterChange,
  planFilter,
  onPlanFilterChange,
  isLoading,
  totalShown,
  totalCount,
}: PharmacyToolbarProps) {
  const hasActiveFilters = statusFilter !== "all" || planFilter !== "all";

  return (
    <div className="p-6 border-b border-slate-100 dark:border-slate-800 flex flex-col md:flex-row md:items-center justify-between gap-4">
      <div className="relative w-full max-w-sm group">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 group-focus-within:text-indigo-500 transition-colors" />
        <Input
          placeholder="Search by name, ID or owner..."
          className="pl-10 bg-slate-100 dark:bg-slate-800 border-none focus-visible:ring-2 focus-visible:ring-indigo-500"
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
        />
      </div>
      <div className="flex items-center gap-3">
        {isLoading && (
          <Loader2 className="h-4 w-4 animate-spin text-indigo-500 mr-2" />
        )}
        
        {hasActiveFilters && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              onStatusFilterChange("all");
              onPlanFilterChange("all");
            }}
            className="text-xs text-rose-500 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-500/10 font-bold"
          >
            Clear Filters
          </Button>
        )}

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              className="font-bold border-2 relative"
            >
              <Filter className="h-4 w-4 mr-2" />
              Filters
              {hasActiveFilters && (
                <span className="absolute -top-1.5 -right-1.5 h-4 w-4 rounded-full bg-indigo-600 text-[10px] text-white flex items-center justify-center font-bold">
                  {(statusFilter !== "all" ? 1 : 0) + (planFilter !== "all" ? 1 : 0)}
                </span>
              )}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48 p-2 rounded-2xl shadow-xl border-slate-200 dark:border-slate-800">
            <DropdownMenuLabel className="text-[10px] uppercase tracking-widest text-slate-400 px-3 py-1.5">Status</DropdownMenuLabel>
            <DropdownMenuItem 
              className={`rounded-xl px-3 py-2 cursor-pointer font-bold flex items-center justify-between ${statusFilter === "all" ? "text-indigo-600 bg-indigo-50/50 dark:text-indigo-400 dark:bg-indigo-500/10" : ""}`}
              onClick={() => onStatusFilterChange("all")}
            >
              <span>All Statuses</span>
              {statusFilter === "all" && <Check className="h-3.5 w-3.5" />}
            </DropdownMenuItem>
            <DropdownMenuItem 
              className={`rounded-xl px-3 py-2 cursor-pointer font-bold flex items-center justify-between ${statusFilter === "active" ? "text-indigo-600 bg-indigo-50/50 dark:text-indigo-400 dark:bg-indigo-500/10" : ""}`}
              onClick={() => onStatusFilterChange("active")}
            >
              <span>Active Only</span>
              {statusFilter === "active" && <Check className="h-3.5 w-3.5" />}
            </DropdownMenuItem>
            <DropdownMenuItem 
              className={`rounded-xl px-3 py-2 cursor-pointer font-bold flex items-center justify-between ${statusFilter === "suspended" ? "text-indigo-600 bg-indigo-50/50 dark:text-indigo-400 dark:bg-indigo-500/10" : ""}`}
              onClick={() => onStatusFilterChange("suspended")}
            >
              <span>Suspended</span>
              {statusFilter === "suspended" && <Check className="h-3.5 w-3.5" />}
            </DropdownMenuItem>
            
            <DropdownMenuSeparator className="my-1.5 bg-slate-100 dark:bg-slate-800" />
            
            <DropdownMenuLabel className="text-[10px] uppercase tracking-widest text-slate-400 px-3 py-1.5">Subscription</DropdownMenuLabel>
            <DropdownMenuItem 
              className={`rounded-xl px-3 py-2 cursor-pointer font-bold flex items-center justify-between ${planFilter === "all" ? "text-indigo-600 bg-indigo-50/50 dark:text-indigo-400 dark:bg-indigo-500/10" : ""}`}
              onClick={() => onPlanFilterChange("all")}
            >
              <span>All Plans</span>
              {planFilter === "all" && <Check className="h-3.5 w-3.5" />}
            </DropdownMenuItem>
            <DropdownMenuItem 
              className={`rounded-xl px-3 py-2 cursor-pointer font-bold flex items-center justify-between ${planFilter === "basic" ? "text-indigo-600 bg-indigo-50/50 dark:text-indigo-400 dark:bg-indigo-500/10" : ""}`}
              onClick={() => onPlanFilterChange("basic")}
            >
              <span>Basic / Starter</span>
              {planFilter === "basic" && <Check className="h-3.5 w-3.5" />}
            </DropdownMenuItem>
            <DropdownMenuItem 
              className={`rounded-xl px-3 py-2 cursor-pointer font-bold flex items-center justify-between ${planFilter === "pro" ? "text-indigo-600 bg-indigo-50/50 dark:text-indigo-400 dark:bg-indigo-500/10" : ""}`}
              onClick={() => onPlanFilterChange("pro")}
            >
              <span>Professional</span>
              {planFilter === "pro" && <Check className="h-3.5 w-3.5" />}
            </DropdownMenuItem>
            <DropdownMenuItem 
              className={`rounded-xl px-3 py-2 cursor-pointer font-bold flex items-center justify-between ${planFilter === "enterprise" ? "text-indigo-600 bg-indigo-50/50 dark:text-indigo-400 dark:bg-indigo-500/10" : ""}`}
              onClick={() => onPlanFilterChange("enterprise")}
            >
              <span>Enterprise</span>
              {planFilter === "enterprise" && <Check className="h-3.5 w-3.5" />}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <div className="h-8 w-px bg-slate-200 dark:bg-slate-800 mx-1 hidden md:block" />
        <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">
          Showing {totalShown} of {totalCount}{" "}
          pharmacies
        </p>
      </div>
    </div>
  );
}
