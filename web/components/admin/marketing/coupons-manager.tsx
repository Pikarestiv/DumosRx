"use client";

import { useState, useEffect } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
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
import { Switch } from "@/components/ui/switch";
import {
  useAdminCoupons,
  useGenerateCouponMutation,
  useToggleCouponMutation,
  useDeleteCouponMutation,
} from "@/lib/api/admin-hooks";
import { toast } from "sonner";

interface Coupon {
  id: string;
  code: string;
  type: "discount_percent" | "trial_extension";
  value: number;
  max_uses: number | null;
  max_uses_per_user: number;
  target_plan: string | null;
  target_interval: string | null;
  expires_at: string | null;
  is_active: boolean;
  usages_count: number;
}

export function CouponsManager() {
  const { data: couponsData, isLoading: loading } = useAdminCoupons();
  const coupons: Coupon[] = couponsData?.data || couponsData || [];

  const generateMutation = useGenerateCouponMutation();
  const toggleMutation = useToggleCouponMutation();
  const deleteMutation = useDeleteCouponMutation();

  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [newCoupon, setNewCoupon] = useState<Partial<Coupon>>({
    type: "discount_percent",
    max_uses_per_user: 1,
    is_active: true,
  });

  const handleGenerate = async () => {
    try {
      const payload = {
        ...newCoupon,
        code: newCoupon.code?.toUpperCase(),
        value: Number(newCoupon.value),
        max_uses: newCoupon.max_uses ? Number(newCoupon.max_uses) : null,
        max_uses_per_user: Number(newCoupon.max_uses_per_user) || 1,
      };

      await generateMutation.mutateAsync(payload);
      toast.success("Coupon generated successfully");
      setIsDialogOpen(false);
      setNewCoupon({
        type: "discount_percent",
        max_uses_per_user: 1,
        is_active: true,
      });
    } catch (error: any) {
      toast.error(error.response?.data?.message || "Failed to generate coupon");
    }
  };

  const handleToggle = async (id: string) => {
    try {
      await toggleMutation.mutateAsync(id);
      toast.success("Coupon status updated");
    } catch (error) {
      toast.error("Failed to update status");
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Are you sure you want to delete this coupon?")) return;
    try {
      await deleteMutation.mutateAsync(id);
      toast.success("Coupon deleted");
    } catch (error) {
      toast.error("Failed to delete coupon");
    }
  };

  if (loading) return <div>Loading...</div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">
            Coupons & Trials
          </h2>
          <p className="text-muted-foreground">
            Manage marketing discounts and trial extensions
          </p>
        </div>
        <Button onClick={() => setIsDialogOpen(true)}>
          <Plus className="mr-2 h-4 w-4" /> Generate Coupon
        </Button>
      </div>

      <div className="border rounded-md">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Code</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Value</TableHead>
              <TableHead>Scope</TableHead>
              <TableHead>Usage</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {coupons.map((coupon) => (
              <TableRow key={coupon.id}>
                <TableCell className="font-mono font-medium">
                  {coupon.code}
                </TableCell>
                <TableCell>
                  <Badge
                    variant={
                      coupon.type === "discount_percent"
                        ? "default"
                        : "secondary"
                    }
                  >
                    {coupon.type === "discount_percent"
                      ? "Discount"
                      : "Trial Ext."}
                  </Badge>
                </TableCell>
                <TableCell>
                  {coupon.type === "discount_percent"
                    ? `${coupon.value}% off`
                    : `+${coupon.value} days`}
                </TableCell>
                <TableCell>
                  <div className="text-xs text-muted-foreground">
                    {coupon.target_plan
                      ? `Plan: ${coupon.target_plan}`
                      : "Any Plan"}{" "}
                    <br />
                    {coupon.target_interval
                      ? `Int: ${coupon.target_interval}`
                      : "Any Int."}
                  </div>
                </TableCell>
                <TableCell>
                  <div className="flex items-center space-x-2">
                    <span className="text-sm">
                      {coupon.usages_count} / {coupon.max_uses || "∞"}
                    </span>
                  </div>
                </TableCell>
                <TableCell>
                  <Switch
                    checked={coupon.is_active}
                    onCheckedChange={() => handleToggle(coupon.id)}
                  />
                </TableCell>
                <TableCell className="text-right">
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => handleDelete(coupon.id)}
                  >
                    <Trash2 className="h-4 w-4 text-red-500" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
            {coupons.length === 0 && (
              <TableRow>
                <TableCell
                  colSpan={7}
                  className="text-center py-8 text-muted-foreground"
                >
                  No coupons generated yet.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Generate New Coupon</DialogTitle>
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
                onValueChange={(v: any) =>
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
                  : "Extra Days (e.g. 14, 30)"}
              </Label>
              <Input
                type="number"
                min={0}
                value={newCoupon.value || ""}
                onChange={(e) =>
                  setNewCoupon({ ...newCoupon, value: Number(e.target.value) })
                }
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label>Target Plan (Optional)</Label>
                <Input
                  placeholder="e.g. Starter"
                  value={newCoupon.target_plan || ""}
                  onChange={(e) =>
                    setNewCoupon({ ...newCoupon, target_plan: e.target.value })
                  }
                />
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

            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label>Max Total Uses</Label>
                <Input
                  type="number"
                  placeholder="Unlimited"
                  value={newCoupon.max_uses || ""}
                  onChange={(e) =>
                    setNewCoupon({
                      ...newCoupon,
                      max_uses: Number(e.target.value),
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
            <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleGenerate}>Generate</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
