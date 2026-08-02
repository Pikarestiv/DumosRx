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
import { TRIAL_DURATIONS } from "@/lib/constants";

const CUSTOM_DATE_OPTION = "custom_date";

interface SharedGrantTrialDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  targetName?: string;
  onConfirm: (plan: string, duration?: string, endDate?: string) => void;
  isPending: boolean;
}

export function SharedGrantTrialDialog({
  open,
  onOpenChange,
  targetName,
  onConfirm,
  isPending,
}: SharedGrantTrialDialogProps) {
  const [plan, setPlan] = useState("pro");
  const [duration, setDuration] = useState("14 days");
  const [customEndDate, setCustomEndDate] = useState("");
  const isCustomDate = duration === CUSTOM_DATE_OPTION;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-106.25 rounded-3xl">
        <DialogHeader>
          <DialogTitle className="text-xl">Grant Free Trial</DialogTitle>
          <DialogDescription>
            Grant a free trial to{" "}
            <span className="font-bold text-slate-900 dark:text-white">
              {targetName || "this account"}
            </span>
            . They will have access to the selected plan features for the
            specified duration.
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
                {TRIAL_DURATIONS.map((d) => (
                  <SelectItem key={d} value={d}>
                    {d}
                  </SelectItem>
                ))}
                <SelectItem value={CUSTOM_DATE_OPTION}>
                  Custom date...
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
          {isCustomDate && (
            <div className="grid gap-3">
              <Label>Expires on</Label>
              <Input
                type="date"
                className="h-12 rounded-xl"
                value={customEndDate}
                min={new Date().toISOString().split("T")[0]}
                onChange={(e) => setCustomEndDate(e.target.value)}
              />
            </div>
          )}
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
            onClick={() =>
              isCustomDate
                ? onConfirm(plan, undefined, customEndDate)
                : onConfirm(plan, duration)
            }
            className="rounded-xl h-11 bg-indigo-600 hover:bg-indigo-700 text-white"
            disabled={isPending || (isCustomDate && !customEndDate)}
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
