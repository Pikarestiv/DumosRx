"use client";

import { memo, useMemo, useState } from "react";
import { Search, UserPlus, X, ChevronDown, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ResponsiveModal } from "@/components/ui/responsive-modal";
import { insert } from "@/lib/db/local-database";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { queryKeys } from "@/lib/query-keys";
import { useHasPermission } from "@/lib/hooks/use-permissions";
import type { Customer } from "@/lib/types/customer";

interface POSCustomerSelectorProps {
  selectedCustomer: Customer | null;
  customers: Customer[];
  loadingCustomers: boolean;
  onSelectCustomer: (customer: Customer | null) => void;
  cartLength?: number;
}

export const POSCustomerSelector = memo(function POSCustomerSelector({
  selectedCustomer,
  customers,
  loadingCustomers,
  onSelectCustomer,
  cartLength = 0,
}: POSCustomerSelectorProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [showAddForm, setShowAddForm] = useState(false);
  const [newFirstName, setNewFirstName] = useState("");
  const [newLastName, setNewLastName] = useState("");
  const [newPhone, setNewPhone] = useState("");

  const canManageCustomers = useHasPermission("manage_customers");

  const queryClient = useQueryClient();

  const createCustomerMutation = useMutation({
    mutationFn: async (data: Pick<Customer, "first_name" | "last_name" | "phone">) => {
      const id = crypto.randomUUID();
      await insert("customers", {
        id,
        first_name: data.first_name,
        last_name: data.last_name,
        phone: data.phone,
        loyalty_points: 0,
        outstanding_balance: 0,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });
      return { id, ...data, loyalty_points: 0 };
    },
    onSuccess: (data) => {
      toast.success("Customer created successfully");
      void queryClient.invalidateQueries(queryKeys.customers.posList());
      onSelectCustomer(data);
      setOpen(false);
      setShowAddForm(false);
      setNewFirstName("");
      setNewLastName("");
      setNewPhone("");
    },
    onError: (_error) => {
      toast.error("Failed to create customer");
    },
  });

  const handleAddCustomer = () => {
    if (!newFirstName.trim()) {
      toast.error("First name is required");
      return;
    }
    createCustomerMutation.mutate({
      first_name: newFirstName.trim(),
      last_name: newLastName.trim(),
      phone: newPhone.trim(),
    });
  };

  // Not recomputed while the modal is closed: this list is only ever read
  // inside it, and POS re-renders on every search keystroke.
  const filteredCustomers = useMemo(() => {
    if (!open) return [];
    const term = search.toLowerCase();
    return customers.filter((c) => {
      const fullName = `${c.first_name} ${c.last_name}`.toLowerCase();
      return fullName.includes(term) || (c.phone && c.phone.includes(term));
    });
  }, [open, customers, search]);

  // get initials
  const initials = selectedCustomer
    ? `${selectedCustomer.first_name[0] || ""}${selectedCustomer.last_name?.[0] || ""}`.toUpperCase() ||
      "C"
    : "WI";

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation();
    onSelectCustomer(null);
  };

  return (
    <div className="px-0 sm:px-5 lg:pt-[18px] pb-3.5 border-b border-border">
      <div className="hidden sm:flex items-center justify-between mb-3">
        <div className="text-[15px] font-semibold">Current sale</div>
        <div className="text-xs text-muted-foreground">{cartLength} items</div>
      </div>

      {/* Trigger. The clear control is a sibling button, not nested inside the
          trigger: nested interactive content is unreachable by keyboard. */}
      <div className="flex items-center gap-2.5 px-3 py-2.5 bg-primary/5 border border-primary/20 rounded-[10px] hover:bg-primary/10 transition-colors">
        <button
          type="button"
          className="flex flex-1 min-w-0 items-center gap-2.5 text-left cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-ring rounded"
          onClick={() => setOpen(true)}
        >
          <div className="w-[30px] h-[30px] rounded-full bg-primary/10 text-primary flex items-center justify-center text-[11.5px] font-bold shrink-0">
            {initials}
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-[12.5px] font-semibold text-foreground truncate">
              {selectedCustomer
                ? `${selectedCustomer.first_name} ${selectedCustomer.last_name || ""}`
                : "Walk-in customer"}
            </div>
            <div className="text-[11px] text-muted-foreground truncate">
              {selectedCustomer
                ? `${selectedCustomer.phone || "No phone"} • ${selectedCustomer.loyalty_points || 0} pts`
                : "Tap to search or add"}
            </div>
          </div>
        </button>
        {selectedCustomer && (
          <button
            type="button"
            aria-label={`Clear selected customer ${selectedCustomer.first_name} ${selectedCustomer.last_name || ""}`.trim()}
            className="shrink-0 rounded p-0.5 text-muted-foreground hover:text-foreground cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-ring"
            onClick={handleClear}
          >
            <X className="w-4 h-4" />
          </button>
        )}
        {!selectedCustomer && (
          <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" />
        )}
      </div>

      <ResponsiveModal
        open={open}
        onOpenChange={setOpen}
        title="Select customer"
      >
        <div className="flex flex-col gap-3.5 pt-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              aria-label="Search customers by name or phone number"
              placeholder="Search by name or phone number"
              className="pl-9 h-10 rounded-xl"
            />
          </div>

          {canManageCustomers && (
            <button
              type="button"
              aria-expanded={showAddForm}
              className="w-full flex items-center gap-2.5 px-3 py-[11px] border border-dashed border-border rounded-xl cursor-pointer text-primary hover:bg-primary/5 transition-colors mt-0.5 outline-none focus-visible:ring-[3px] focus-visible:ring-ring"
              onClick={() => setShowAddForm(!showAddForm)}
            >
              <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                <UserPlus className="w-[15px] h-[15px]" />
              </div>
              <span className="text-[12.5px] font-semibold">
                Add new customer
              </span>
            </button>
          )}

          {canManageCustomers && showAddForm && (
            <div className="flex flex-col gap-3 p-3 bg-muted/50 border border-border rounded-xl">
              <div className="flex gap-2.5">
                <Input
                  aria-label="First name"
                  placeholder="First name"
                  value={newFirstName}
                  onChange={(e) => setNewFirstName(e.target.value)}
                  className="flex-1 h-9"
                />
                <Input
                  aria-label="Last name"
                  placeholder="Last name"
                  value={newLastName}
                  onChange={(e) => setNewLastName(e.target.value)}
                  className="flex-1 h-9"
                />
              </div>
              <Input
                aria-label="Phone number"
                placeholder="Phone number"
                value={newPhone}
                onChange={(e) => setNewPhone(e.target.value)}
                className="h-9"
              />
              <Button
                onClick={handleAddCustomer}
                disabled={createCustomerMutation.isPending}
                className="w-full font-bold"
              >
                {createCustomerMutation.isPending
                  ? "Saving..."
                  : "Save & select"}
              </Button>
            </div>
          )}

          <div className="text-[11.5px] font-bold text-muted-foreground uppercase tracking-wide mt-2">
            {search.trim().length > 0 ? "Matching customers" : "All customers"}
          </div>

          <div className="overflow-y-auto max-h-[300px] -mx-1 px-1 pb-4">
            <div className="flex flex-col gap-2.5">
              <div
                role="button"
                tabIndex={0}
                className="flex items-center gap-3 px-3 py-[11px] border border-border rounded-xl cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-ring hover:border-primary hover:bg-primary/5 transition-colors"
                onClick={() => {
                  onSelectCustomer(null);
                  setOpen(false);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    onSelectCustomer(null);
                    setOpen(false);
                  }
                }}
              >
                <div className="w-[30px] h-[30px] rounded-full bg-primary/10 text-primary flex items-center justify-center text-[11.5px] font-bold shrink-0">
                  WI
                </div>
                <div className="flex-1">
                  <div className="text-[13px] font-semibold">
                    Walk-in customer
                  </div>
                  <div className="text-[11.5px] text-muted-foreground mt-0.5">
                    No account needed
                  </div>
                </div>
                {!selectedCustomer && (
                  <div className="text-[10.5px] font-bold px-2 py-[3px] rounded-md whitespace-nowrap bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400">
                    Default
                  </div>
                )}
              </div>

              {loadingCustomers && (
                <div className="text-center py-4 text-sm text-muted-foreground">
                  Loading customers...
                </div>
              )}
              {!loadingCustomers &&
                filteredCustomers.map((c) => {
                  const custInitials =
                    `${c.first_name[0] || ""}${c.last_name?.[0] || ""}`.toUpperCase() ||
                    "C";
                  const isSelected = selectedCustomer?.id === c.id;
                  return (
                    <div
                      key={c.id}
                      role="button"
                      tabIndex={0}
                      className="flex items-center gap-3 px-3 py-[11px] border border-border rounded-xl cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-ring hover:border-primary hover:bg-primary/5 transition-colors"
                      onClick={() => {
                        onSelectCustomer(c);
                        setOpen(false);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          onSelectCustomer(c);
                          setOpen(false);
                        }
                      }}
                    >
                      <div className="w-[30px] h-[30px] rounded-full bg-primary/10 text-primary flex items-center justify-center text-[11.5px] font-bold shrink-0">
                        {custInitials}
                      </div>
                      <div className="flex-1 overflow-hidden">
                        <div className="text-[13px] font-semibold truncate">
                          {c.first_name} {c.last_name}
                        </div>
                        <div className="text-[11.5px] text-muted-foreground mt-0.5 truncate">
                          {c.phone || "No phone"}
                        </div>
                      </div>
                      <div className="text-[10.5px] font-bold px-2 py-[3px] rounded-md whitespace-nowrap bg-primary/10 text-primary flex items-center gap-1">
                        {isSelected && <Check className="w-3 h-3" />}
                        {c.loyalty_points || 0} pts
                      </div>
                    </div>
                  );
                })}
            </div>
          </div>
        </div>
      </ResponsiveModal>
    </div>
  );
});
