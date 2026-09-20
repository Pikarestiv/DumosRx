import { useState } from "react";
import { Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";

interface SharedActivatePlanDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  targetName?: string;
  onConfirm: (plan: string, billingCycle: string, amount: number, reference?: string) => void;
  isPending: boolean;
}

export function SharedActivatePlanDialog({
  open,
  onOpenChange,
  targetName,
  onConfirm,
  isPending,
}: SharedActivatePlanDialogProps) {
  const [plan, setPlan] = useState("pro");
  const [billingCycle, setBillingCycle] = useState("monthly");
  const [amount, setAmount] = useState("");
  const [reference, setReference] = useState("");

  const amountValue = Number(amount);
  const isAmountValid = amount.trim() !== "" && !Number.isNaN(amountValue) && amountValue >= 0;

  const handleConfirm = () => {
    if (!isAmountValid) return;
    onConfirm(plan, billingCycle, amountValue, reference.trim() || undefined);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-106.25 rounded-3xl">
        <DialogHeader>
          <DialogTitle className="text-xl">Activate Paid Plan</DialogTitle>
          <DialogDescription>
            Record a payment settled outside checkout (e.g. bank transfer) and
            activate the plan for{" "}
            <span className="font-bold text-slate-900 dark:text-white">
              {targetName || "this account"}
            </span>
            .
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-6 py-4">
          <div className="grid gap-3">
            <Label>Plan Tier</Label>
            <Select value={plan} onValueChange={setPlan}>
              <SelectTrigger className="w-full h-12 rounded-xl">
                <SelectValue placeholder="Select plan" />
              </SelectTrigger>
              <SelectContent className="rounded-xl">
                <SelectItem value="starter">Starter Plan</SelectItem>
                <SelectItem value="pro">Pro Plan</SelectItem>
                <SelectItem value="enterprise">Enterprise Plan</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-3">
            <Label>Billing Cycle</Label>
            <Select value={billingCycle} onValueChange={setBillingCycle}>
              <SelectTrigger className="w-full h-12 rounded-xl">
                <SelectValue placeholder="Select billing cycle" />
              </SelectTrigger>
              <SelectContent className="rounded-xl">
                <SelectItem value="monthly">Monthly</SelectItem>
                <SelectItem value="yearly">Yearly</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-3">
            <Label>Amount Paid (₦)</Label>
            <Input
              type="number"
              min={0}
              inputMode="decimal"
              className="h-12 rounded-xl"
              placeholder="e.g. 8000"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
          </div>
          <div className="grid gap-3">
            <Label>Reference / Note (optional)</Label>
            <Input
              className="h-12 rounded-xl"
              placeholder="e.g. bank ref number"
              value={reference}
              onChange={(e) => setReference(e.target.value)}
            />
          </div>
        </div>
        <DialogFooter className="gap-2 sm:space-x-2">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            className="rounded-xl h-11"
            disabled={isPending}
          >
            Cancel
          </Button>
          <Button
            onClick={handleConfirm}
            className="rounded-xl h-11 bg-indigo-600 hover:bg-indigo-700 text-white"
            disabled={isPending || !isAmountValid}
          >
            {isPending ? (
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
            ) : null}
            Activate Plan
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
