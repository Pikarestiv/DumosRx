"use client";

import { Search, Filter, Loader2 } from "lucide-react";
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

interface PharmacyToolbarProps {
  search: string;
  onSearchChange: (value: string) => void;
  isLoading: boolean;
  totalShown: number;
  totalCount: number;
}

export function PharmacyToolbar({
  search,
  onSearchChange,
  isLoading,
  totalShown,
  totalCount,
}: PharmacyToolbarProps) {
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
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              className="font-bold border-2"
            >
              <Filter className="h-4 w-4 mr-2" />
              Filters
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48 p-2">
            <DropdownMenuLabel>Status</DropdownMenuLabel>
            <DropdownMenuItem className="cursor-pointer">
              Active Only
            </DropdownMenuItem>
            <DropdownMenuItem className="cursor-pointer">
              Pending Approval
            </DropdownMenuItem>
            <DropdownMenuItem className="cursor-pointer">
              Suspended
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuLabel>Subscription</DropdownMenuLabel>
            <DropdownMenuItem className="cursor-pointer">
              Basic
            </DropdownMenuItem>
            <DropdownMenuItem className="cursor-pointer">
              Professional
            </DropdownMenuItem>
            <DropdownMenuItem className="cursor-pointer">
              Enterprise
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
