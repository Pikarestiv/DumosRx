import type React from "react";
import { useState, useEffect } from "react";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import { toast } from "sonner";
import { apiClient } from "@/lib/api/client";
import { isTauri } from "@/lib/db/local-database";

export interface StockAdjustment {
  id: string;
  date: string;
  product: string;
  adjustmentType: "increase" | "decrease";
  quantity: number;
  reason: string;
  notes: string;
  user: string;
  approved: boolean;
}

export function useStockAdjustments() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  const [adjustments, setAdjustments] = useState<StockAdjustment[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddForm, setShowAddForm] = useState(
    searchParams.get("action") === "adjust"
  );
  const [searchTerm, setSearchTerm] = useState("");
  const [newAdjustment, setNewAdjustment] = useState({
    product: searchParams.get("product") || "",
    adjustmentType: "decrease" as "increase" | "decrease",
    quantity: 0,
    reason: "",
    notes: "",
  });

  useEffect(() => {
    // Clear URL parameters after setting state
    if (searchParams.get("action") === "adjust") {
      const params = new URLSearchParams(searchParams.toString());
      params.delete("action");
      params.delete("product");
      router.replace(`${pathname}?${params.toString()}`);
    }
  }, [searchParams, pathname, router]);

  const reasons = [
    "Damaged Goods",
    "Expired",
    "Theft/Loss",
    "Found Stock",
    "Counting Error",
    "Quality Issues",
    "Transfer",
    "Other",
  ];

  useEffect(() => {
    async function fetchAdjustments() {
      setLoading(true);
      try {
        let res;
        if (isTauri()) {
          const { getStockAdjustments } =
            await import("@/lib/db/local-database");
          res = await getStockAdjustments(1, 100);
        } else {
          res = await apiClient.getStockAdjustments(1, 100);
        }

        const items = (res.data || []).map((a: any) => ({
          id: a.id,
          date: a.created_at || a.date,
          product: a.product?.name || a.product_name || "Unknown",
          adjustmentType: a.adjustment_type || a.type || "decrease",
          quantity: a.quantity || 0,
          reason: a.reason || "",
          notes: a.notes || "",
          user: a.user?.name || a.user_name || "System",
          approved: a.approved ?? false,
        }));
        setAdjustments(items);
      } catch (error) {
        console.error("Failed to fetch stock adjustments:", error);
      } finally {
        setLoading(false);
      }
    }
    fetchAdjustments();
  }, []);

  const handleSubmitAdjustment = async (e: React.FormEvent) => {
    e.preventDefault();

    if (
      !newAdjustment.product ||
      !newAdjustment.reason ||
      newAdjustment.quantity === 0
    ) {
      toast.error("Please fill in all required fields");
      return;
    }

    const calculatedQty =
      newAdjustment.adjustmentType === "decrease"
        ? -Math.abs(newAdjustment.quantity)
        : Math.abs(newAdjustment.quantity);

    if (isTauri()) {
      try {
        const { query, execute } = await import("@/lib/db/core");
        // Resolve product ID from the name selection
        const med = await query<any>(
          "SELECT id FROM products WHERE name = ? LIMIT 1",
          [newAdjustment.product],
        );
        if (!med || med.length === 0) {
          toast.error(
            "Selected product not found in database. Please enter or register a valid product.",
          );
          return;
        }
        const productId = med[0].id;
        const uuid = crypto.randomUUID();

        // Insert stock movement record
        await execute(
          `INSERT INTO stock_movements (id, product_id, movement_type, quantity, reason, created_at, _synced) 
           VALUES (?, ?, 'adjustment', ?, ?, ?, 0)`,
          [
            uuid,
            productId,
            calculatedQty,
            newAdjustment.reason,
            new Date().toISOString(),
          ],
        );

        // Adjust product stock level locally
        await execute(
          `UPDATE products SET stock_quantity = stock_quantity + ?, updated_at = ? WHERE id = ?`,
          [calculatedQty, new Date().toISOString(), productId],
        );
      } catch (err) {
        console.error("Failed to apply local adjustment:", err);
        toast.error("Failed to save stock adjustment locally");
        return;
      }
    }

    const adjustment: StockAdjustment = {
      id: Date.now().toString(),
      date: new Date().toISOString(),
      product: newAdjustment.product,
      adjustmentType: newAdjustment.adjustmentType,
      quantity: calculatedQty,
      reason: newAdjustment.reason,
      notes: newAdjustment.notes,
      user: "Current User",
      approved: isTauri() ? true : false,
    };

    setAdjustments([adjustment, ...adjustments]);
    setNewAdjustment({
      product: "",
      adjustmentType: "decrease",
      quantity: 0,
      reason: "",
      notes: "",
    });
    setShowAddForm(false);
    toast.success(
      isTauri()
        ? "Stock adjustment applied successfully"
        : "Stock adjustment submitted for approval",
    );
  };

  const pendingAdjustments = adjustments.filter((adj) => !adj.approved).length;
  const totalAdjustments = adjustments.length;
  const thisMonthAdjustments = adjustments.filter(
    (adj) => new Date(adj.date).getMonth() === new Date().getMonth(),
  ).length;

  return {
    adjustments,
    loading,
    showAddForm,
    setShowAddForm,
    searchTerm,
    setSearchTerm,
    newAdjustment,
    setNewAdjustment,
    reasons,
    handleSubmitAdjustment,
    pendingAdjustments,
    totalAdjustments,
    thisMonthAdjustments,
  };
}
