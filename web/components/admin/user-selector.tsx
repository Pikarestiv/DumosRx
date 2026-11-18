"use client";

import { useState, useEffect } from "react";
import { Check, ChevronsUpDown, Loader2, Search, X } from "lucide-react";
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
import { Badge } from "@/components/ui/badge";
import { useAdminUsers } from "@/lib/api/admin-hooks";
import type { AdminUser } from "@/lib/types/admin";
import type { AdminAccountType } from "@/lib/types/admin-users";

const ACCOUNT_FILTERS: { value: AdminAccountType | ""; label: string }[] = [
  { value: "", label: "Everyone" },
  { value: "owners", label: "Store owners" },
  { value: "staff", label: "Staff" },
  { value: "platform", label: "Admins" },
];

interface UserSelectorProps {
  selectedUsers: AdminUser[];
  onUsersChange: (users: AdminUser[]) => void;
  targetType?: "all" | "specific";
  onTargetTypeChange?: (type: "all" | "specific") => void;
  hideTargetToggle?: boolean;
  showAccountTypeFilter?: boolean;
}

export function UserSelector({
  selectedUsers,
  onUsersChange,
  targetType = "specific",
  onTargetTypeChange = () => undefined,
  hideTargetToggle = false,
  showAccountTypeFilter = false,
}: UserSelectorProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [accountType, setAccountType] = useState<AdminAccountType | "">("");
  const [page, setPage] = useState(1);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search);
      setPage(1);
    }, 500);
    return () => clearTimeout(timer);
  }, [search]);

  const { data, isLoading } = useAdminUsers(page, debouncedSearch, "", accountType);
  const users = data?.data || [];
  const lastPage = data?.meta?.last_page ?? 1;

  const chooseAccountType = (value: AdminAccountType | "") => {
    setAccountType(value);
    setPage(1);
  };

  const handleSelect = (user: AdminUser) => {
    const isSelected = selectedUsers.some((u) => u.id === user.id);
    if (isSelected) {
      onUsersChange(selectedUsers.filter((u) => u.id !== user.id));
    } else {
      onUsersChange([...selectedUsers, user]);
    }
  };

  const removeUser = (id: string) => {
    onUsersChange(selectedUsers.filter((u) => u.id !== id));
  };

  return (
    <div className="space-y-4">
      {!hideTargetToggle && <div className="flex flex-col sm:flex-row gap-4 sm:items-center">
        <label className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
          Target Audience:
        </label>
        <div className="flex gap-2">
          <Button
            type="button"
            variant={targetType === "all" ? "default" : "outline"}
            onClick={() => onTargetTypeChange("all")}
            className="w-32"
          >
            All Users
          </Button>
          <Button
            type="button"
            variant={targetType === "specific" ? "default" : "outline"}
            onClick={() => onTargetTypeChange("specific")}
            className="w-32"
          >
            Specific Users
          </Button>
        </div>
      </div>}

      {targetType === "specific" && (
        <div className="space-y-3">
          <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                role="combobox"
                aria-expanded={open}
                className="w-full justify-between"
              >
                Select users...
                <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-[400px] p-0" align="start">
              <Command shouldFilter={false}>
                {showAccountTypeFilter && (
                  <div className="flex flex-wrap gap-1 border-b p-2">
                    {ACCOUNT_FILTERS.map((filter) => (
                      <Button
                        key={filter.label}
                        type="button"
                        size="sm"
                        variant={accountType === filter.value ? "default" : "outline"}
                        className="h-7 rounded-full px-3 text-xs"
                        onClick={() => chooseAccountType(filter.value)}
                      >
                        {filter.label}
                      </Button>
                    ))}
                  </div>
                )}
                <div className="flex items-center border-b px-3">
                  <Search className="mr-2 h-4 w-4 shrink-0 opacity-50" />
                  <input
                    placeholder="Search name or email..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="flex h-11 w-full rounded-md bg-transparent py-3 text-sm outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50"
                  />
                  {isLoading && <Loader2 className="h-4 w-4 animate-spin opacity-50" />}
                </div>
                <CommandList>
                  <CommandEmpty>
                    {isLoading ? "Searching..." : "No users found."}
                  </CommandEmpty>
                  <CommandGroup>
                    {users.map((user) => {
                      const isSelected = selectedUsers.some((u) => u.id === user.id);
                      return (
                        <CommandItem
                          key={user.id}
                          onSelect={() => handleSelect(user)}
                          className="flex justify-between items-center"
                        >
                          <div>
                            <p className="font-medium">{user.name}</p>
                            <p className="text-xs text-muted-foreground">{user.email}</p>
                          </div>
                          <div className={cn(
                            "mr-2 flex h-4 w-4 items-center justify-center rounded-sm border border-primary",
                            isSelected
                              ? "bg-primary text-primary-foreground"
                              : "opacity-50 [&_svg]:invisible"
                          )}>
                            <Check className={cn("h-4 w-4")} />
                          </div>
                        </CommandItem>
                      );
                    })}
                  </CommandGroup>
                </CommandList>
                {lastPage > 1 && (
                  <div className="flex items-center justify-between border-t p-2 text-xs text-muted-foreground">
                    <Button type="button" size="sm" variant="ghost" disabled={page <= 1} onClick={() => setPage(page - 1)}>
                      Previous
                    </Button>
                    <span>
                      Page {page} of {lastPage}
                    </span>
                    <Button type="button" size="sm" variant="ghost" disabled={page >= lastPage} onClick={() => setPage(page + 1)}>
                      Next
                    </Button>
                  </div>
                )}
              </Command>
            </PopoverContent>
          </Popover>

          {selectedUsers.length > 0 && (
            <div className="flex flex-wrap gap-2 p-3 bg-muted/30 rounded-md border border-border/50">
              {selectedUsers.map((user) => (
                <Badge key={user.id} variant="secondary" className="pl-3 pr-1 py-1 gap-1">
                  {user.name}
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-auto p-0 text-muted-foreground hover:text-foreground ml-1"
                    onClick={() => removeUser(user.id)}
                  >
                    <X className="h-3 w-3" />
                  </Button>
                </Badge>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
