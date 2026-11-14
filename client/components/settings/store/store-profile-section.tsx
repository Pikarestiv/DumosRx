import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { StoreType } from "@/lib/context/store-context";
import { toast } from "sonner";
import { HelpTooltip } from "./help-tooltip";

interface StoreProfileSectionProps {
  storeType: StoreType;
  isEditingProfile: boolean;
  localPcn: string;
  setLocalPcn: (val: string) => void;
  showRetailSuggestions?: boolean;
  setShowRetailSuggestions?: (val: boolean) => void;
  loyaltyProgramEnabled?: boolean;
  setLoyaltyProgramEnabled?: (val: boolean) => void;
  canAccessLoyaltyProgramPlan?: boolean;
  getUpgradeMessage: (feature: string, fallback?: string) => string;
}

// The parts of Business Information that are specific to this store's storefront presence, kept visually nested since a bu…
// Rationale: docs/CLIENT_COMMENTS.md#block-components-settings-store-store-profile-section-tsx-L38
export function StoreProfileSection({
  storeType,
  isEditingProfile,
  localPcn,
  setLocalPcn,
  showRetailSuggestions = false,
  setShowRetailSuggestions,
  loyaltyProgramEnabled = false,
  setLoyaltyProgramEnabled,
  canAccessLoyaltyProgramPlan = false,
  getUpgradeMessage,
}: StoreProfileSectionProps) {
  const showPharmacyFields = storeType === "pharmacy";
  // Nothing left to show is a real state for a retail store whose group lacks the storefront key and whose plan has no loyal…
  // Rationale: docs/CLIENT_COMMENTS.md#line-components-settings-store-store-profile-section-tsx-L102
  if (!setLoyaltyProgramEnabled && !showPharmacyFields) {
    return null;
  }

  return (
    <div className="rounded-lg border p-4 space-y-4">
      <div className="space-y-1">
        <h4 className="text-sm font-semibold">Store Profile</h4>
        <p className="text-xs text-muted-foreground">
          Settings specific to this store.
        </p>
      </div>

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
          {isEditingProfile ? (
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
            {isEditingProfile ? (
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
              {isEditingProfile ? (
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
    </div>
  );
}
