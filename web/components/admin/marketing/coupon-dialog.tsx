import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DatePickerInput } from "@/components/ui/date-picker-input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2 } from "lucide-react";
import type { Coupon } from "@/lib/types/admin";
import { PLAN_SLUGS } from "@/lib/constants/subscription-plans";
import type {
  useGenerateCouponMutation,
  useUpdateCouponMutation,
} from "@/lib/api/admin-hooks";

interface CouponDialogProps {
  isDialogOpen: boolean;
  setIsDialogOpen: (open: boolean) => void;
  editingId: string | null;
  newCoupon: Partial<Coupon>;
  setNewCoupon: (coupon: Partial<Coupon>) => void;
  handleSave: () => void;
  generateMutation: ReturnType<typeof useGenerateCouponMutation>;
  updateMutation: ReturnType<typeof useUpdateCouponMutation>;
}

export function CouponDialog({
  isDialogOpen,
  setIsDialogOpen,
  editingId,
  newCoupon,
  setNewCoupon,
  handleSave,
  generateMutation,
  updateMutation,
}: CouponDialogProps) {
  return (
    <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>
            {editingId ? "Edit Coupon" : "Generate New Coupon"}
          </DialogTitle>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="grid gap-2">
            <Label>Coupon Code</Label>
            <Input
              placeholder="e.g. SUMMER50"
              value={newCoupon.code || ""}
              onChange={(e) =>
                setNewCoupon({ ...newCoupon, code: e.target.value })
              }
              className="uppercase"
            />
          </div>

          <div className="grid gap-2">
            <Label>Type</Label>
            <Select
              value={newCoupon.type}
              onValueChange={(v: Coupon["type"]) =>
                setNewCoupon({ ...newCoupon, type: v })
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="discount_percent">
                  Percentage Discount
                </SelectItem>
                <SelectItem value="discount_amount">
                  Fixed Amount Discount
                </SelectItem>
                <SelectItem value="trial_extension">
                  Free Trial Extension
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-2">
            <Label>
              {newCoupon.type === "discount_percent"
                ? "Discount Percentage (0-100)"
                : newCoupon.type === "discount_amount"
                  ? "Discount Amount (₦)"
                  : "Extra Days (e.g. 14, 30)"}
            </Label>
            <Input
              type="number"
              min={0}
              // A percentage has a ceiling; a naira amount and a number of
              // trial days do not. Without this the "(0-100)" in the label
              // was the only thing stopping a 500%-off coupon.
              max={newCoupon.type === "discount_percent" ? 100 : undefined}
              value={newCoupon.value || ""}
              onChange={(e) =>
                setNewCoupon({ ...newCoupon, value: Number(e.target.value) })
              }
            />
            {newCoupon.type === "discount_percent" &&
              (newCoupon.value ?? 0) > 100 && (
                <p className="text-xs text-rose-500">
                  A percentage discount cannot exceed 100%.
                </p>
              )}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="grid gap-2">
              <Label>Target Plan (Optional)</Label>
              {/* Free text here silently produced coupons that matched no
                  plan at all: the backend compares this against the real
                  plan slug. */}
              <Select
                value={newCoupon.target_plan || "any"}
                onValueChange={(v) =>
                  setNewCoupon({
                    ...newCoupon,
                    target_plan: v === "any" ? null : v,
                  })
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="All Plans" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="any">All Plans</SelectItem>
                  {PLAN_SLUGS.map((slug) => (
                    <SelectItem key={slug} value={slug} className="capitalize">
                      {slug}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label>Interval (Optional)</Label>
              <Select
                value={newCoupon.target_interval || "any"}
                onValueChange={(v) =>
                  setNewCoupon({
                    ...newCoupon,
                    target_interval: v === "any" ? null : v,
                  })
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Any" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="any">Any</SelectItem>
                  <SelectItem value="monthly">Monthly</SelectItem>
                  <SelectItem value="yearly">Yearly</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid gap-2">
            <Label>Expiry Date (Optional)</Label>
            <DatePickerInput
              value={newCoupon.expires_at || ""}
              onChange={(val) =>
                setNewCoupon({ ...newCoupon, expires_at: val })
              }
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="grid gap-2">
              <Label>Max Total Uses</Label>
              {/* An empty field is the only thing that means "unlimited".
                  Mapping it to `null` here (rather than letting it become
                  `Number("") === 0` and then be treated as falsy downstream)
                  is what stops a typed-then-cleared limit from silently
                  submitting as unlimited - the opposite of what was typed. */}
              <Input
                type="number"
                min={1}
                placeholder="Unlimited"
                value={newCoupon.max_uses ?? ""}
                onChange={(e) =>
                  setNewCoupon({
                    ...newCoupon,
                    max_uses:
                      e.target.value.trim() === ""
                        ? null
                        : Number(e.target.value),
                  })
                }
              />
            </div>
            <div className="grid gap-2">
              <Label>Max Uses Per User</Label>
              <Input
                type="number"
                min={1}
                value={newCoupon.max_uses_per_user || 1}
                onChange={(e) =>
                  setNewCoupon({
                    ...newCoupon,
                    max_uses_per_user: Number(e.target.value),
                  })
                }
              />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => setIsDialogOpen(false)}
            disabled={generateMutation.isPending || updateMutation.isPending}
          >
            Cancel
          </Button>
          <Button
            onClick={handleSave}
            disabled={generateMutation.isPending || updateMutation.isPending}
          >
            {(generateMutation.isPending || updateMutation.isPending) && (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            )}
            {editingId ? "Save Changes" : "Generate"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
