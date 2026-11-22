import { Pencil, Save, X } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { StoreType } from "@/lib/context/store-context";
import { useFeatureGate } from "@/lib/hooks/use-feature-gate";
import { HelpTooltip } from "./help-tooltip";

interface StoreProfileCardProps {
  storeType: StoreType;
  localPcn: string;
  setLocalPcn: (val: string) => void;
  showRetailSuggestions?: boolean;
  setShowRetailSuggestions?: (val: boolean) => void;
  loyaltyProgramEnabled?: boolean;
  setLoyaltyProgramEnabled?: (val: boolean) => void;
  canAccessLoyaltyProgramPlan?: boolean;
  handleSaveProfile: () => void;
}

export function StoreProfileCard({
  storeType,
  localPcn,
  setLocalPcn,
  showRetailSuggestions = false,
  setShowRetailSuggestions,
  loyaltyProgramEnabled = false,
  setLoyaltyProgramEnabled,
  canAccessLoyaltyProgramPlan = false,
  handleSaveProfile,
}: StoreProfileCardProps) {
  const { withRestriction, getUpgradeMessage } = useFeatureGate();
  const [isEditing, setIsEditing] = useState(false);

  const showPharmacyFields = storeType === "pharmacy";
  if (!setLoyaltyProgramEnabled && !showPharmacyFields) {
    return null;
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-4">
        <div className="space-y-1.5">
          <CardTitle>Store Profile</CardTitle>
          <CardDescription>Settings specific to this store.</CardDescription>
        </div>
        <Button
          variant="ghost"
          size="icon"
          aria-label={isEditing ? "Cancel editing store profile" : "Edit store profile"}
          onClick={() => setIsEditing(!isEditing)}
        >
          {isEditing ? <X className="h-4 w-4" /> : <Pencil className="h-4 w-4" />}
        </Button>
      </CardHeader>

      <CardContent className="space-y-4">
        {setLoyaltyProgramEnabled && (
          <div className="flex items-center justify-between rounded-lg border p-4 bg-background">
            <div className="space-y-0.5">
              <div className="flex items-center gap-2">
                <Label className="text-base">Enable Loyalty Program</Label>
                <HelpTooltip>
                  When off, points stop earning and the Redeem Reward option
                  disappears from POS checkout. Tiers and rewards stay
                  configured for whenever you turn it back on.
                </HelpTooltip>
              </div>
              <p className="text-sm text-muted-foreground">
                Let customers earn and redeem points on purchases
              </p>
            </div>
            {isEditing ? (
              <Switch
                id="loyalty-program-enabled"
                checked={loyaltyProgramEnabled}
                onCheckedChange={(val) => {
                  if (!canAccessLoyaltyProgramPlan) {
                    toast.error(
                      getUpgradeMessage(
                        "loyalty_program",
                        "Upgrade to a premium plan to use the Loyalty Program.",
                      ),
                    );
                    return;
                  }
                  setLoyaltyProgramEnabled?.(val);
                }}
              />
            ) : (
              <p className="text-sm font-medium py-2">
                {loyaltyProgramEnabled ? "Enabled" : "Disabled"}
              </p>
            )}
          </div>
        )}

        {showPharmacyFields && (
          <>
            <div className="grid gap-2">
              <Label htmlFor="pcn">PCN License Number</Label>
              {isEditing ? (
                <Input
                  id="pcn"
                  placeholder="PCN/..."
                  value={localPcn}
                  onChange={(e) => setLocalPcn(e.target.value)}
                />
              ) : (
                <p className="text-sm font-medium py-2">
                  {localPcn || "Not set"}
                </p>
              )}
            </div>
            {setShowRetailSuggestions && (
              <div className="flex items-center justify-between rounded-lg border p-4 bg-background">
                <div className="space-y-0.5">
                  <div className="flex items-center gap-2">
                    <Label className="text-base">
                      Include Retail Items in Suggestions
                    </Label>
                    <HelpTooltip>
                      When enabled, general retail products (like
                      provisions) will appear alongside products in search
                      suggestions during sales.
                    </HelpTooltip>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Show retail items (provisions, cosmetics, etc.) in product
                    suggestions
                  </p>
                </div>
                {isEditing ? (
                  <Switch
                    id="retail-suggestions"
                    checked={showRetailSuggestions}
                    onCheckedChange={setShowRetailSuggestions}
                  />
                ) : (
                  <p className="text-sm font-medium py-2">
                    {showRetailSuggestions ? "Enabled" : "Disabled"}
                  </p>
                )}
              </div>
            )}
          </>
        )}
      </CardContent>

      {isEditing && (
        <CardFooter className="border-t px-6 py-4">
          <Button
            onClick={() => {
              withRestriction(handleSaveProfile)();
              setIsEditing(false);
            }}
            className="cursor-pointer"
          >
            <Save className="w-4 h-4 mr-2" />
            Save Changes
          </Button>
        </CardFooter>
      )}
    </Card>
  );
}
