"use client";

import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";




import { Switch } from "@/components/ui/switch";
import {
  useAdminCoupons,
  useGenerateCouponMutation,
  useToggleCouponMutation,
  useDeleteCouponMutation,
  useUpdateCouponMutation,
} from "@/lib/api/admin-hooks";
import { toast } from "sonner";
import { CouponDialog } from "./coupon-dialog";
import type { Coupon } from "@/lib/types/admin";

export function CouponsManager() {
  const { data: couponsData, isLoading: loading } = useAdminCoupons();
  const coupons: Coupon[] = couponsData
    ? Array.isArray(couponsData)
      ? couponsData
      : couponsData.data
    : [];

  const generateMutation = useGenerateCouponMutation();
  const toggleMutation = useToggleCouponMutation();
  const deleteMutation = useDeleteCouponMutation();

  const updateMutation = useUpdateCouponMutation();

  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [newCoupon, setNewCoupon] = useState<Partial<Coupon>>({
    type: "discount_percent",
    max_uses_per_user: 1,
    is_active: true,
  });

  const openEditDialog = (coupon: Coupon) => {
    setEditingId(coupon.id);
    setNewCoupon({
      ...coupon,
      expires_at: coupon.expires_at ? new Date(coupon.expires_at).toISOString().split('T')[0] : null,
    });
    setIsDialogOpen(true);
  };

  const openCreateDialog = () => {
    setEditingId(null);
    setNewCoupon({
      type: "discount_percent",
      max_uses_per_user: 1,
      is_active: true,
    });
    setIsDialogOpen(true);
  };

  const handleSave = async () => {
    try {
      const payload = {
        ...newCoupon,
        code: newCoupon.code?.toUpperCase(),
        value: Number(newCoupon.value),
        max_uses: newCoupon.max_uses ? Number(newCoupon.max_uses) : null,
        max_uses_per_user: Number(newCoupon.max_uses_per_user) || 1,
        expires_at: newCoupon.expires_at || null,
      };

      if (editingId) {
        await updateMutation.mutateAsync({ id: editingId, payload });
        toast.success("Coupon updated successfully");
      } else {
        await generateMutation.mutateAsync(payload);
        toast.success("Coupon generated successfully");
      }
      setIsDialogOpen(false);
      setNewCoupon({
        type: "discount_percent",
        max_uses_per_user: 1,
        is_active: true,
      });
      setEditingId(null);
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : `Failed to ${editingId ? 'update' : 'generate'} coupon`,
      );
    }
  };

  const handleToggle = async (id: string) => {
    try {
      await toggleMutation.mutateAsync(id);
      toast.success("Coupon status updated");
    } catch (_error) {
      toast.error("Failed to update status");
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Are you sure you want to delete this coupon?")) return;
    try {
      await deleteMutation.mutateAsync(id);
      toast.success("Coupon deleted");
    } catch (_error) {
      toast.error("Failed to delete coupon");
    }
  };

  if (loading) return <div>Loading...</div>;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">
            Coupons & Trials
          </h2>
          <p className="text-muted-foreground">
            Manage marketing discounts and trial extensions
          </p>
        </div>
        <Button onClick={openCreateDialog} className="w-full sm:w-auto">
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
              <TableHead>Usage & Expiry</TableHead>
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
                        : coupon.type === "discount_amount"
                        ? "destructive"
                        : "secondary"
                    }
                  >
                    {coupon.type === "discount_percent"
                      ? "Discount %"
                      : coupon.type === "discount_amount"
                      ? "Discount ₦"
                      : "Trial Ext."}
                  </Badge>
                </TableCell>
                <TableCell>
                  {coupon.type === "discount_percent"
                    ? `${coupon.value}% off`
                    : coupon.type === "discount_amount"
                    ? `₦${coupon.value.toLocaleString()} off`
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
                  <div className="flex flex-col space-y-1">
                    <span className="text-sm font-medium">
                      Uses: {coupon.usages_count} / {coupon.max_uses || "∞"}
                    </span>
                    {coupon.expires_at && (
                      <span className="text-xs text-muted-foreground">
                        Exp: {new Date(coupon.expires_at).toLocaleDateString()}
                      </span>
                    )}
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
                    size="sm"
                    className="mr-2"
                    onClick={() => openEditDialog(coupon)}
                  >
                    Edit
                  </Button>
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

      <CouponDialog
        isDialogOpen={isDialogOpen}
        setIsDialogOpen={setIsDialogOpen}
        editingId={editingId}
        newCoupon={newCoupon}
        setNewCoupon={setNewCoupon}
        handleSave={handleSave}
        generateMutation={generateMutation}
        updateMutation={updateMutation}
      />
    </div>
  );
}
