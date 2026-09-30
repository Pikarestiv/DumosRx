"use client";

import { useState } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { NumericConfigInput } from "@/components/admin/numeric-config-input";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import {
  useSystemConfig,
  useUpdateSystemConfigMutation,
} from "@/lib/api/hooks";

const DEFAULT_STOREFRONT_FEE = 2;
const MAX_STOREFRONT_FEE = 50;

const percent = (value: number) => `${value}%`;

export function StorefrontCommissionCard() {
  const { data: serverFee } = useSystemConfig(
    "storefront_platform_fee_percentage",
  );
  const savedFee =
    typeof serverFee === "number" ? serverFee : DEFAULT_STOREFRONT_FEE;
  const [localFee, setLocalFee] = useState(savedFee);
  const [prevServerFee, setPrevServerFee] = useState(serverFee);
  const [pendingConfirm, setPendingConfirm] = useState(false);
  const updateMutation = useUpdateSystemConfigMutation();

  // serverFee is undefined at mount, so useState above captures only the
  // fallback - resync once the real value lands.
  if (serverFee !== prevServerFee) {
    setPrevServerFee(serverFee);
    if (typeof serverFee === "number") setLocalFee(serverFee);
  }

  const handleSave = async () => {
    try {
      await updateMutation.mutateAsync({
        key: "storefront_platform_fee_percentage",
        value: localFee,
      });
      toast.success("Storefront commission updated.");
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Failed to update the storefront commission",
      );
    }
  };

  return (
    <Card className="bg-white dark:bg-slate-900 border-accent/20">
      <CardHeader>
        <CardTitle>Storefront Commission</CardTitle>
        <CardDescription>
          The percentage DumosRx keeps from every online storefront sale.
          Changing this updates every store that already has a connected
          payment account, not just new ones.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="max-w-xs">
          <NumericConfigInput
            id="storefront-commission"
            label="Storefront Commission (%)"
            value={localFee}
            min={0}
            max={MAX_STOREFRONT_FEE}
            step={0.5}
            isAcceptable={(fee) => fee >= 0 && fee <= MAX_STOREFRONT_FEE}
            rejectionHint={`Enter a commission between 0% and ${MAX_STOREFRONT_FEE}%.`}
            formatValue={percent}
            onCommit={setLocalFee}
          />
        </div>
      </CardContent>
      <CardFooter>
        <Button
          onClick={() => setPendingConfirm(true)}
          disabled={updateMutation.isPending}
        >
          Save Storefront Commission
        </Button>
      </CardFooter>

      <ConfirmDialog
        open={pendingConfirm}
        onOpenChange={setPendingConfirm}
        title="Change the storefront commission?"
        description={`Every storefront sale on the platform moves from ${percent(savedFee)} to ${percent(localFee)} as soon as you confirm.`}
        confirmLabel="Update commission"
        onConfirm={() => void handleSave()}
      />
    </Card>
  );
}
