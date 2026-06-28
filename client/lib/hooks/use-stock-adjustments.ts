import type React from "react";
import { useState, useEffect } from "react";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import { toast } from "sonner";

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
    searchParams.get("action") === "adjust",
  );
  const [searchTerm, setSearchTerm] = useState("");
  const [newAdjustment, setNewAdjustment] = useState({
    product: searchParams.get("product") || "",
    batch_id: "",
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

  const [availableBatches, setAvailableBatches] = useState<any[]>([]);

  useEffect(() => {
    if (!newAdjustment.product) {
      setAvailableBatches([]);
      return;
    }

    async function fetchBatches() {
      try {
        const { query } = await import("@/lib/db/core");
        const med = await query<any>(
          "SELECT id FROM products WHERE name = ? LIMIT 1",
          [newAdjustment.product],
        );
        if (med && med.length > 0) {
          const batches = await query<any>(
            "SELECT * FROM stock_batches WHERE product_id = ? AND _deleted = 0 AND quantity > 0 ORDER BY expiry_date ASC",
            [med[0].id],
          );
          setAvailableBatches(batches);

          if (batches.length === 1) {
            setNewAdjustment((prev) => ({ ...prev, batch_id: batches[0].id }));
          } else {
            setNewAdjustment((prev) => ({ ...prev, batch_id: "" }));
          }
        }
      } catch (err) {
        console.error(err);
      }
    }

    fetchBatches();
  }, [newAdjustment.product]);

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
        const { getStockAdjustments } = await import("@/lib/db/local-database");
        const res = await getStockAdjustments(1, 100);

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

    if (true) {
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

        // Adjust stock_batches
        if (
          newAdjustment.batch_id === "new" ||
          (!newAdjustment.batch_id && calculatedQty > 0)
        ) {
          // Increase: Add to an 'ADJUSTMENT' batch
          const batchId = crypto.randomUUID();
          await execute(
            "INSERT INTO stock_batches (id, product_id, batch_number, quantity, is_active, created_at, updated_at) VALUES (?, ?, 'ADJUSTMENT', ?, 1, ?, ?)",
            [
              batchId,
              productId,
              Math.abs(calculatedQty),
              new Date().toISOString(),
              new Date().toISOString(),
            ],
          );

          await execute(
            "UPDATE stock_movements SET stock_batch_id = ? WHERE id = ?",
            [batchId, uuid],
          );
        } else if (newAdjustment.batch_id) {
          await execute(
            "UPDATE stock_batches SET quantity = quantity + ?, updated_at = ? WHERE id = ?",
            [calculatedQty, new Date().toISOString(), newAdjustment.batch_id],
          );

          await execute(
            "UPDATE stock_movements SET stock_batch_id = ? WHERE id = ?",
            [newAdjustment.batch_id, uuid],
          );
        } else if (calculatedQty < 0) {
          // Fallback FIFO
          const batches = await query<any>(
            "SELECT * FROM stock_batches WHERE product_id = ? AND _deleted = 0 AND quantity > 0 ORDER BY expiry_date ASC, created_at ASC",
            [productId],
          );
          let remainingToDeduct = Math.abs(calculatedQty);
          for (const batch of batches) {
            if (remainingToDeduct <= 0) break;
            const deduction = Math.min(batch.quantity, remainingToDeduct);
            await execute(
              "UPDATE stock_batches SET quantity = quantity - ?, updated_at = ? WHERE id = ?",
              [deduction, new Date().toISOString(), batch.id],
            );
            remainingToDeduct -= deduction;
          }
        }
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
      approved: true,
    };

    setAdjustments([adjustment, ...adjustments]);
    setNewAdjustment({
      product: "",
      batch_id: "",
      adjustmentType: "decrease",
      quantity: 0,
      reason: "",
      notes: "",
    });
    setShowAddForm(false);
    toast.success("Stock adjustment applied successfully");
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
    availableBatches,
    handleSubmitAdjustment,
    pendingAdjustments,
    totalAdjustments,
    thisMonthAdjustments,
  };
}
