"use client";

import { useState } from "react";
import { Check, ChevronsUpDown, Loader2, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { useDebounce } from "@/hooks/use-debounce";
import { useAdminUsers } from "@/lib/api/admin-hooks";
import type { AdminUser } from "@/lib/types/admin";

type AdjustType = "earned" | "spent" | "admin_adjustment";

interface ReferralsAdjustDialogProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  onAdjust: (
    userId: string,
    amount: number,
    type: AdjustType,
    description: string
  ) => Promise<{ referral_credits?: number } | void>;
}

const TYPE_LABELS: Record<AdjustType, string> = {
  earned: "Credit / Award Wallet (Earned)",
  spent: "Deduct / Charge Wallet (Spent)",
  admin_adjustment: "Discretionary Correction (Adjustment)",
};

const naira = (amount: number) => `₦${amount.toLocaleString()}`;

/** Search-driven single user picker.
 *
 * Replaces a plain <Select> fed by `useAdminUsers()` with default args -
 * which meant page 1 only, ten users, no search, so on any real platform
 * most wallets simply could not be selected and similarly-named users were
 * easy to confuse. Same Command+Popover pattern as
 * components/admin/user-selector.tsx, narrowed to a single selection. */
function UserSearchSelect({
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

export function ReferralsAdjustDialog({
  isOpen,
  onOpenChange,
  onAdjust,
}: ReferralsAdjustDialogProps) {
  const [selectedUser, setSelectedUser] = useState<AdminUser | null>(null);
  const [adjustAmount, setAdjustAmount] = useState("");
  const [adjustType, setAdjustType] = useState<AdjustType>("admin_adjustment");
  const [adjustDescription, setAdjustDescription] = useState("");
  const [adjusting, setAdjusting] = useState(false);
  const [isConfirming, setIsConfirming] = useState(false);

  const resetForm = () => {
    setSelectedUser(null);
    setAdjustAmount("");
    setAdjustDescription("");
    setAdjustType("admin_adjustment");
    setIsConfirming(false);
  };

  /** Reset on *every* close, not just on success. Keeping the previous
   * user and amount around after a cancel is how a careless confirm applies
   * a stale adjustment to the wrong wallet. */
  const handleOpenChange = (open: boolean) => {
    if (!open) resetForm();
    onOpenChange(open);
  };

  const parsedAmount = Number(adjustAmount);
  const amountIsValid =
    adjustAmount.trim() !== "" &&
    Number.isFinite(parsedAmount) &&
    parsedAmount > 0;

  const handleReview = () => {
    if (!selectedUser || !adjustAmount.trim() || !adjustDescription.trim()) {
      toast.error("Please fill in all adjustment fields");
      return;
    }
    // The `min={0}` attribute alone never fired here - this is not a form
    // submit, so the browser never validates it, and a negative amount went
    // out as typed. On the server a negative "spent" amount used to slip
    // past the insufficient-funds guard and *credit* the wallet.
    if (!amountIsValid) {
      toast.error("Enter a positive amount", {
        description:
          "The adjustment type decides the direction - the amount itself is always positive.",
      });
      return;
    }
    setIsConfirming(true);
  };

  const handleConfirm = async () => {
    if (!selectedUser || !amountIsValid) return;

    setAdjusting(true);
    try {
      const result = await onAdjust(
        selectedUser.id,
        parsedAmount,
        adjustType,
        adjustDescription
      );
      const newBalance =
        result && typeof result.referral_credits === "number"
          ? result.referral_credits
          : null;
      toast.success("Credits adjusted successfully!", {
        description:
          newBalance !== null
            ? `New wallet balance: ${naira(newBalance)}`
            : undefined,
      });
      handleOpenChange(false);
    } catch (error) {
      setIsConfirming(false);
      toast.error(
        error instanceof Error ? error.message : "Failed to adjust credits"
      );
    } finally {
      setAdjusting(false);
    }
  };

  const userLabel = selectedUser
    ? `${selectedUser.name || `${selectedUser.first_name ?? ""} ${selectedUser.last_name ?? ""}`.trim()} (${selectedUser.email})`
    : "";

  const effectSentence =
    adjustType === "spent"
      ? `${naira(amountIsValid ? parsedAmount : 0)} will be DEDUCTED from ${userLabel}.`
      : `${naira(amountIsValid ? parsedAmount : 0)} will be ADDED to ${userLabel}.`;

  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      <DialogContent className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-slate-100 sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle className="font-bold text-lg">
            {isConfirming ? "Confirm this adjustment" : "Manually Adjust Credits"}
          </DialogTitle>
          <DialogDescription>
            {isConfirming
              ? "Referral credits spend like money on this platform. Check the wallet and the direction before applying."
              : "The adjustment type decides the direction; the amount is always a positive number."}
          </DialogDescription>
        </DialogHeader>

        {isConfirming ? (
          <div className="grid gap-3 py-4">
            <div className="rounded-lg border border-amber-200 bg-amber-50 dark:border-amber-900/40 dark:bg-amber-950/20 p-4 space-y-2">
              <p className="font-bold text-amber-800 dark:text-amber-400">
                {effectSentence}
              </p>
              <p className="text-sm text-amber-700 dark:text-amber-500">
                Type: {TYPE_LABELS[adjustType]}
              </p>
            </div>
            <div className="text-sm text-muted-foreground">
              <span className="font-semibold">Reason:</span>{" "}
              {adjustDescription}
            </div>
          </div>
        ) : (
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label className="font-bold text-xs text-slate-500">
                Target User
              </Label>
              <UserSearchSelect
                selected={selectedUser}
                onSelect={setSelectedUser}
              />
            </div>

            <div className="grid gap-2">
              <Label
                htmlFor="type"
                className="font-bold text-xs text-slate-500"
              >
                Adjustment Type
              </Label>
              <Select
                value={adjustType}
                onValueChange={(v: AdjustType) => setAdjustType(v)}
              >
                <SelectTrigger
                  id="type"
                  className="bg-white dark:bg-slate-950 border-slate-200 dark:border-slate-800"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-900 dark:text-slate-100">
                  <SelectItem value="earned">{TYPE_LABELS.earned}</SelectItem>
                  <SelectItem value="spent">{TYPE_LABELS.spent}</SelectItem>
                  <SelectItem value="admin_adjustment">
                    {TYPE_LABELS.admin_adjustment}
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-2">
              <Label
                htmlFor="amount"
                className="font-bold text-xs text-slate-500"
              >
                Amount (₦)
              </Label>
              <Input
                id="amount"
                type="number"
                min={0.01}
                step="0.01"
                placeholder="e.g. 5000"
                value={adjustAmount}
                onChange={(e) => setAdjustAmount(e.target.value)}
                className={`bg-white dark:bg-slate-950 border-slate-200 dark:border-slate-800 ${
                  adjustAmount.trim() !== "" && !amountIsValid
                    ? "border-rose-500 focus-visible:ring-rose-500"
                    : ""
                }`}
              />
              {adjustAmount.trim() !== "" && !amountIsValid && (
                <p className="text-xs text-rose-500">
                  Enter a positive amount. A negative value is never a valid
                  adjustment - pick &quot;Deduct&quot; to take credits away.
                </p>
              )}
            </div>

            <div className="grid gap-2">
              <Label
                htmlFor="desc"
                className="font-bold text-xs text-slate-500"
              >
                Reason / Description
              </Label>
              <Input
                id="desc"
                placeholder="e.g. Compensation for payment gateway delay"
                value={adjustDescription}
                onChange={(e) => setAdjustDescription(e.target.value)}
                className="bg-white dark:bg-slate-950 border-slate-200 dark:border-slate-800"
              />
            </div>
          </div>
        )}

        <DialogFooter>
          <Button
            variant="outline"
            className="border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800"
            disabled={adjusting}
            onClick={() =>
              isConfirming ? setIsConfirming(false) : handleOpenChange(false)
            }
          >
            {isConfirming ? "Back" : "Cancel"}
          </Button>
          <Button
            onClick={() =>
              isConfirming ? void handleConfirm() : handleReview()
            }
            disabled={adjusting}
            className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold"
          >
            {adjusting
              ? "Processing..."
              : isConfirming
                ? "Apply Adjustment"
                : "Review Adjustment"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
