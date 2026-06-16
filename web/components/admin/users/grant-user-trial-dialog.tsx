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

interface GrantUserTrialDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  user: any;
  onConfirm: (plan: string, duration: string) => void;
  isPending: boolean;
}

export function GrantUserTrialDialog({
  open,
  onOpenChange,
  user,
  onConfirm,
  isPending,
}: GrantUserTrialDialogProps) {
  const [plan, setPlan] = useState("pro");
  const [duration, setDuration] = useState("14 days");

  const durations = [
    "1day",
    "3 days",
    "7 days",
    "14 days",
    "21 days",
    "30 days",
    "3 months",
    "6 months"
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px] rounded-3xl">
        <DialogHeader>
          <DialogTitle className="text-xl">Grant Free Trial</DialogTitle>
          <DialogDescription>
            Grant a free trial to{" "}
            <span className="font-bold text-slate-900 dark:text-white">
              {user?.name}
            </span>
            . They will have access to the selected plan features for the specified duration.
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
            <Label>Duration</Label>
            <Select value={duration} onValueChange={setDuration}>
              <SelectTrigger className="w-full h-12 rounded-xl">
                <SelectValue placeholder="Select duration" />
              </SelectTrigger>
              <SelectContent className="rounded-xl max-h-[200px]">
                {durations.map((d) => (
                  <SelectItem key={d} value={d}>
                    {d}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter className="gap-2 sm:gap-0">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            className="rounded-xl h-11"
            disabled={isPending}
          >
            Cancel
          </Button>
          <Button
            onClick={() => onConfirm(plan, duration)}
            className="rounded-xl h-11 bg-indigo-600 hover:bg-indigo-700 text-white"
            disabled={isPending}
          >
            {isPending ? (
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
            ) : null}
            Grant Trial
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
