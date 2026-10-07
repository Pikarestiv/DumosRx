"use client";

import { useState } from "react";
import { Search, Loader2, ChevronsUpDown, Check, Store as StoreIcon, User as UserIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";




import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useAdminStores } from "@/lib/api/admin-hooks-stores";
import { useAdminUsers } from "@/lib/api/admin-hooks-users";
import { useDebounce } from "@/hooks/use-debounce";
import { cn } from "@/lib/utils";

const ACTION_BADGE_STYLES: Record<string, string> = {
  LOGIN: "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400",
  LOGOUT: "bg-slate-100 text-slate-700 dark:bg-slate-500/10 dark:text-slate-400",
  LOGIN_FAILED: "bg-red-50 text-red-700 dark:bg-red-500/10 dark:text-red-400",
  PIN_CHANGED: "bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-400",
  SALE_RETURN: "bg-orange-50 text-orange-700 dark:bg-orange-500/10 dark:text-orange-400",
  HARD_DELETE: "bg-red-50 text-red-700 dark:bg-red-500/10 dark:text-red-400",
  DELETE: "bg-red-50 text-red-700 dark:bg-red-500/10 dark:text-red-400",
};

export function ActionBadge({ action }: { action: string }) {
  return (
    <Badge
      variant="secondary"
      className={`font-bold ${ACTION_BADGE_STYLES[action] || "bg-indigo-50 text-indigo-700 dark:bg-indigo-500/10 dark:text-indigo-400"}`}
    >
      {action.replace(/_/g, " ")}
    </Badge>
  );
}

export interface SelectedEntity {
  id: string;
  label: string;
}

/** Single-select search-and-pick popover, shared shape for the Store and
 * User activity-log filters below. Deliberately not the multi-select
 * UserSelector used for broadcast targeting elsewhere in admin/ - a log
 * filter narrows to exactly one store/user at a time, not a target list. */
export function StoreFilterPicker({
  value,
  onChange,
}: {
  value: SelectedEntity | null;
  onChange: (value: SelectedEntity | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebounce(search, 400);
  const { data, isLoading } = useAdminStores(1, debouncedSearch);
  const stores = data?.data || [];

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          size="sm"
          className={cn("font-bold border-2 max-w-[160px]", value && "text-indigo-600 border-indigo-200 dark:border-indigo-500/30")}
        >
          <StoreIcon className="h-4 w-4 mr-2 shrink-0" />
          <span className="truncate">{value?.label || "All Stores"}</span>
          <ChevronsUpDown className="h-4 w-4 ml-2 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[300px] p-0" align="start">
        <Command shouldFilter={false}>
          <div className="flex items-center border-b px-3">
            <Search className="mr-2 h-4 w-4 shrink-0 opacity-50" />
            <input
              placeholder="Search stores..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="flex h-11 w-full rounded-md bg-transparent py-3 text-sm outline-none placeholder:text-muted-foreground"
            />
            {isLoading && <Loader2 className="h-4 w-4 animate-spin opacity-50" />}
          </div>
          <CommandList>
            <CommandEmpty>{isLoading ? "Searching..." : "No stores found."}</CommandEmpty>
            <CommandGroup>
              <CommandItem
                onSelect={() => {
                  onChange(null);
                  setOpen(false);
                }}
              >
                <Check className={cn("mr-2 h-4 w-4", !value ? "opacity-100" : "opacity-0")} />
                All Stores
              </CommandItem>
              {stores.map((store) => (
                <CommandItem
                  key={store.id}
                  onSelect={() => {
                    onChange({ id: store.id, label: store.name });
                    setOpen(false);
                  }}
                >
                  <Check className={cn("mr-2 h-4 w-4", value?.id === store.id ? "opacity-100" : "opacity-0")} />
                  <div className="min-w-0">
                    <p className="font-medium truncate">{store.name}</p>
                    <p className="text-xs text-muted-foreground truncate">{store.owner}</p>
                  </div>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

export function UserFilterPicker({
  value,
  onChange,
}: {
  value: SelectedEntity | null;
  onChange: (value: SelectedEntity | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebounce(search, 400);
  const { data, isLoading } = useAdminUsers(1, debouncedSearch);
  const users = data?.data || [];

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          size="sm"
          className={cn("font-bold border-2 max-w-[160px]", value && "text-indigo-600 border-indigo-200 dark:border-indigo-500/30")}
        >
          <UserIcon className="h-4 w-4 mr-2 shrink-0" />
          <span className="truncate">{value?.label || "All Users"}</span>
          <ChevronsUpDown className="h-4 w-4 ml-2 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[300px] p-0" align="start">
        <Command shouldFilter={false}>
          <div className="flex items-center border-b px-3">
            <Search className="mr-2 h-4 w-4 shrink-0 opacity-50" />
            <input
              placeholder="Search name or email..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="flex h-11 w-full rounded-md bg-transparent py-3 text-sm outline-none placeholder:text-muted-foreground"
            />
            {isLoading && <Loader2 className="h-4 w-4 animate-spin opacity-50" />}
          </div>
          <CommandList>
            <CommandEmpty>{isLoading ? "Searching..." : "No users found."}</CommandEmpty>
            <CommandGroup>
              <CommandItem
                onSelect={() => {
                  onChange(null);
                  setOpen(false);
                }}
              >
                <Check className={cn("mr-2 h-4 w-4", !value ? "opacity-100" : "opacity-0")} />
                All Users
              </CommandItem>
              {users.map((user) => (
                <CommandItem
                  key={user.id}
                  onSelect={() => {
                    onChange({ id: user.id, label: user.name });
                    setOpen(false);
                  }}
                >
                  <Check className={cn("mr-2 h-4 w-4", value?.id === user.id ? "opacity-100" : "opacity-0")} />
                  <div className="min-w-0">
                    <p className="font-medium truncate">{user.name}</p>
                    <p className="text-xs text-muted-foreground truncate">{user.email}</p>
                  </div>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
