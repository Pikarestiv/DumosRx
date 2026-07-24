"use client";

import { useState } from "react";
import { Search, UserPlus, X, ChevronDown, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ResponsiveModal } from "@/components/ui/responsive-modal";
import { insert } from "@/lib/db/local-database";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

interface Customer {
  id: string;
  first_name: string;
  last_name: string;
  phone: string;
  loyalty_points: number;
}

interface POSCustomerSelectorProps {
  selectedCustomer: Customer | null;
  customers: Customer[];
  loadingCustomers: boolean;
  onSelectCustomer: (customer: Customer | null) => void;
  cartLength?: number;
}

export function POSCustomerSelector({
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

  const queryClient = useQueryClient();

  const createCustomerMutation = useMutation({
    mutationFn: async (data: Partial<Customer>) => {
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
      queryClient.invalidateQueries({ queryKey: ["posCustomers"] });
      onSelectCustomer(data as any);
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

  const filteredCustomers = customers.filter((c) => {
    const term = search.toLowerCase();
    const fullName = `${c.first_name} ${c.last_name}`.toLowerCase();
    return fullName.includes(term) || (c.phone && c.phone.includes(term));
  });

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
    <div className="px-0 sm:px-5 pt-[18px] pb-3.5 border-b border-border">
      <div className="hidden sm:flex items-center justify-between mb-3">
        <div className="text-[15px] font-semibold">Current sale</div>
        <div className="text-xs text-muted-foreground">{cartLength} items</div>
      </div>

      {/* Trigger */}
      <div
        className="flex items-center gap-2.5 px-3 py-2.5 bg-primary/5 border border-primary/20 rounded-[10px] cursor-pointer hover:bg-primary/10 transition-colors"
        onClick={() => setOpen(true)}
      >
        <div className="w-[30px] h-[30px] rounded-full bg-primary/10 text-primary flex items-center justify-center text-[11.5px] font-bold shrink-0">
          {initials}
        </div>
        <div className="flex-1 text-left">
          <div className="text-[12.5px] font-semibold text-foreground">
            {selectedCustomer
              ? `${selectedCustomer.first_name} ${selectedCustomer.last_name || ""}`
              : "Walk-in customer"}
          </div>
          <div className="text-[11px] text-muted-foreground">
            {selectedCustomer
              ? `${selectedCustomer.phone || "No phone"} • ${selectedCustomer.loyalty_points || 0} pts`
              : "Tap to search or add"}
          </div>
        </div>
        {selectedCustomer && (
          <X
            className="w-4 h-4 text-muted-foreground hover:text-foreground shrink-0"
            onClick={handleClear}
          />
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
              placeholder="Search by name or phone number"
              className="pl-9 h-10 rounded-xl"
            />
          </div>

          <div
            className="flex items-center gap-2.5 px-3 py-[11px] border border-dashed border-border rounded-xl cursor-pointer text-primary hover:bg-primary/5 transition-colors mt-0.5"
            onClick={() => setShowAddForm(!showAddForm)}
          >
            <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
              <UserPlus className="w-[15px] h-[15px]" />
            </div>
            <span className="text-[12.5px] font-semibold">
              Add new customer
            </span>
          </div>

          {showAddForm && (
            <div className="flex flex-col gap-3 p-3 bg-muted/50 border border-border rounded-xl">
              <div className="flex gap-2.5">
                <Input
                  placeholder="First name"
                  value={newFirstName}
                  onChange={(e) => setNewFirstName(e.target.value)}
                  className="flex-1 h-9"
                />
                <Input
                  placeholder="Last name"
                  value={newLastName}
                  onChange={(e) => setNewLastName(e.target.value)}
                  className="flex-1 h-9"
                />
              </div>
              <Input
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
            Frequent customers
          </div>

          <div className="overflow-y-auto max-h-[300px] -mx-1 px-1 pb-4">
            <div className="flex flex-col gap-2.5">
              <div
                className="flex items-center gap-3 px-3 py-[11px] border border-border rounded-xl cursor-pointer hover:border-primary hover:bg-primary/5 transition-colors"
                onClick={() => {
                  onSelectCustomer(null);
                  setOpen(false);
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
              {!loadingCustomers && filteredCustomers.map((c) => {
                const custInitials =
                  `${c.first_name[0] || ""}${c.last_name?.[0] || ""}`.toUpperCase() ||
                  "C";
                const isSelected = selectedCustomer?.id === c.id;
                return (
                  <div
                    key={c.id}
                    className="flex items-center gap-3 px-3 py-[11px] border border-border rounded-xl cursor-pointer hover:border-primary hover:bg-primary/5 transition-colors"
                    onClick={() => {
                      onSelectCustomer(c);
                      setOpen(false);
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
}
