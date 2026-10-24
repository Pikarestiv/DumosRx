"use client";

import { useState } from "react";
import { Check, ChevronsUpDown, Loader2, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { useDebounce } from "@/hooks/use-debounce";
import { useAdminUsers } from "@/lib/api/admin-hooks";
import type { AdminUser } from "@/lib/types/admin";

export function UserSearchSelect({
  selected,
  onSelect,
}: {
  selected: AdminUser | null;
  onSelect: (user: AdminUser) => void;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebounce(search, 500);
  const { data, isLoading, error } = useAdminUsers(1, debouncedSearch);
  const users = data?.data || [];

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="w-full justify-between bg-white dark:bg-slate-950 border-slate-200 dark:border-slate-800 font-normal"
        >
          {selected
            ? `${selected.name || `${selected.first_name ?? ""} ${selected.last_name ?? ""}`.trim()} (${selected.email})`
            : "Search for a user to adjust"}
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[380px] p-0" align="start">
        <Command shouldFilter={false}>
          <div className="flex items-center border-b px-3">
            <Search className="mr-2 h-4 w-4 shrink-0 opacity-50" />
            <input
              placeholder="Search name or email..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="flex h-11 w-full rounded-md bg-transparent py-3 text-sm outline-none placeholder:text-muted-foreground"
            />
            {isLoading && (
              <Loader2 className="h-4 w-4 animate-spin opacity-50" />
            )}
          </div>
          <CommandList>
            <CommandEmpty>
              {error
                ? error instanceof Error
                  ? error.message
                  : "Could not search users."
                : isLoading
                  ? "Searching..."
                  : "No users found."}
            </CommandEmpty>
            <CommandGroup>
              {users.map((user) => (
                <CommandItem
                  key={user.id}
                  onSelect={() => {
                    onSelect(user);
                    setOpen(false);
                  }}
                  className="flex justify-between items-center"
                >
                  <div>
                    <p className="font-medium">
                      {user.name ||
                        `${user.first_name ?? ""} ${user.last_name ?? ""}`.trim()}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {user.email}
                    </p>
                  </div>
                  <Check
                    className={cn(
                      "ml-2 h-4 w-4",
                      selected?.id === user.id ? "opacity-100" : "opacity-0"
                    )}
                  />
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
