"use client";

import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";
import type { AppliedCoupon } from "@/lib/types/subscription-plans";

interface CouponInputProps {
  couponCode: string;
  setCouponCode: (code: string) => void;
  appliedCoupon: AppliedCoupon | null;
  setAppliedCoupon: (coupon: AppliedCoupon | null) => void;
  validatingCoupon: boolean;
  handleValidateCoupon: () => void;
}

export function CouponInput({
  couponCode,
  setCouponCode,
  appliedCoupon,
  setAppliedCoupon,
  validatingCoupon,
  handleValidateCoupon,
}: CouponInputProps) {
  return (
    <div className="flex items-center gap-2 w-full sm:w-auto">
      <div className="flex-1 sm:w-56 relative">
        <input
          type="text"
          placeholder="Have a coupon code?"
          value={couponCode}
          onChange={(e) => setCouponCode(e.target.value.toUpperCase())}
          disabled={validatingCoupon || appliedCoupon !== null}
          className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
        />
      </div>
      {appliedCoupon ? (
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            setAppliedCoupon(null);
            setCouponCode("");
          }}
        >
          Remove
        </Button>
      ) : (
        <Button size="sm" onClick={handleValidateCoupon} disabled={!couponCode || validatingCoupon}>
          {validatingCoupon ? <Loader2 className="h-4 w-4 animate-spin" /> : "Apply"}
        </Button>
      )}
    </div>
  );
}
