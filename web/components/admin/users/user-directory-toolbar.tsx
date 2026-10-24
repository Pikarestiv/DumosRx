import { Search, Filter, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { AdminAccountType } from "@/lib/types/admin";
import {
  ACCOUNT_TYPE_TABS,
  ROLE_LABELS_BY_ACCOUNT_TYPE,
} from "@/components/admin/users/user-directory-filters";

interface UserDirectoryToolbarProps {
  accountType: AdminAccountType;
  onAccountTypeChange: (next: AdminAccountType) => void;
  search: string;
  onSearchChange: (value: string) => void;
  roleFilter: string | null;
  onRoleFilterChange: (label: string | null) => void;
  isLoading: boolean;
  total: number;
}

export function UserDirectoryToolbar({
  accountType,
  onAccountTypeChange,
  search,
  onSearchChange,
  roleFilter,
  onRoleFilterChange,
  isLoading,
  total,
}: UserDirectoryToolbarProps) {
  const availableRoleLabels = ROLE_LABELS_BY_ACCOUNT_TYPE[accountType];
  const activeTabHint = ACCOUNT_TYPE_TABS.find((tab) => tab.value === accountType)?.hint ?? "";

  return (
    <>
      <div className="px-6 pt-6 flex flex-col gap-2">
        <div className="inline-flex w-fit rounded-2xl bg-slate-100 dark:bg-slate-800 p-1">
          {ACCOUNT_TYPE_TABS.map((tab) => (
            <button
              key={tab.value}
              type="button"
              onClick={() => onAccountTypeChange(tab.value)}
              className={`rounded-xl px-4 py-2 text-sm font-bold transition-colors ${
                accountType === tab.value
                  ? "bg-white dark:bg-slate-900 text-indigo-600 shadow-sm"
                  : "text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
        <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
          {activeTabHint}
        </p>
      </div>
      <div className="p-6 border-b border-slate-100 dark:border-slate-800 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="relative w-full max-w-sm group">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 group-focus-within:text-indigo-500 transition-colors" />
          <Input
            placeholder="Search by name, email or store..."
            className="pl-10 bg-slate-50 dark:bg-slate-800 border-none focus-visible:ring-2 focus-visible:ring-indigo-500"
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
          />
        </div>
        <div className="flex items-center gap-3">
          {isLoading && (
            <Loader2 className="h-4 w-4 animate-spin text-indigo-500 mr-2" />
          )}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className="font-bold border-2"
              >
                <Filter className="h-4 w-4 mr-2" />
                {roleFilter || "Roles"}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="end"
              className="w-48 p-2 rounded-2xl shadow-xl"
            >
              <DropdownMenuLabel className="text-[10px] uppercase tracking-widest text-slate-400 px-3 py-2">
                System Role
              </DropdownMenuLabel>
              <DropdownMenuItem
                className="rounded-xl px-3 py-2 cursor-pointer font-bold"
                onClick={() => onRoleFilterChange(null)}
              >
                All Roles
              </DropdownMenuItem>
              {availableRoleLabels.map((label) => (
                <DropdownMenuItem
                  key={label}
                  className="rounded-xl px-3 py-2 cursor-pointer font-bold"
                  onClick={() => onRoleFilterChange(label)}
                >
                  {label}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
          <div className="h-8 w-px bg-slate-200 dark:bg-slate-800 mx-1 hidden md:block" />
          <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">
            Global Directory: {total} Users
          </p>
        </div>
      </div>
    </>
  );
}
