/**
 * Dev utility to seed local SQLite with initial data
 */
"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { sync } from "@/lib/db/sync-engine";
import { RefreshCw, Database } from "lucide-react";
import { toast } from "sonner";
import { insert } from "@/lib/db/local-database";
import { useAuthStore } from "@/lib/auth/store";

export function DevSeedButton() {
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);

  const seedData = async () => {
    try {
      setLoading(true);

      // Seed Medicines
      await insert("medicines", {
        id: "m1",
        name: "Paracetamol",
        brand_name: "Emzor",
        category_id: "c1",
        stock_quantity: 500,
        is_active: 1,
      });
      await insert("medicines", {
        id: "m2",
        name: "Amoxicillin",
        brand_name: "Beecham",
        category_id: "c2",
        stock_quantity: 120,
        is_active: 1,
      });
      await insert("medicines", {
        id: "m3",
        name: "Vitamin C",
        brand_name: "Emzor",
        category_id: "c4",
        stock_quantity: 50,
        is_active: 1,
        reorder_level: 100,
      });

      // Seed Sales (today)
      const today = new Date().toISOString();
      const user = useAuthStore.getState().user;
      const cashierId = user?.id || "u1";

      await insert("sales", {
        id: "s1",
        cashier_id: cashierId,
        total_amount: 1500,
        amount_paid: 1500,
        change_given: 0,
        subtotal: 1500,
        tax_amount: 0,
        tax_percentage: 7.5,
        discount_amount: 0,
        discount_percentage: 0,
        points_earned: 0,
        points_redeemed: 0,
        created_at: today,
        transaction_date: today,
        payment_status: "completed",
        receipt_printed: 0,
      });
      await insert("sales", {
        id: "s2",
        cashier_id: cashierId,
        total_amount: 2500,
        amount_paid: 2500,
        change_given: 0,
        subtotal: 2500,
        tax_amount: 0,
        tax_percentage: 7.5,
        discount_amount: 0,
        discount_percentage: 0,
        points_earned: 0,
        points_redeemed: 0,
        created_at: today,
        transaction_date: today,
        payment_status: "completed",
        receipt_printed: 0,
      });

      // Seed Customers
      await insert("customers", {
        id: "c1",
        first_name: "John",
        last_name: "Doe",
        phone: "08012345678",
      });

      toast.success("Database seeded with sample data");
    } catch (err) {
      console.error(err);
      toast.error("Failed to seed database");
    } finally {
      setLoading(false);
    }
  };

  const handleSync = async () => {
    try {
      setSyncing(true);
      const result = await sync();
      if (result.success) {
        toast.success(
          `Sync Complete: Pushed ${result.pushed}, Pulled ${result.pulled}`,
        );
      } else {
        toast.error("Sync failed");
      }
    } finally {
      setSyncing(false);
    }
  };

  return (
    <div className="fixed bottom-4 right-4 z-50 flex gap-2">
      <Button
        variant="outline"
        size="sm"
        onClick={handleSync}
        disabled={syncing}
        className="shadow-lg border-2 border-primary bg-background cursor-pointer"
      >
        <RefreshCw
          className={`h-4 w-4 mr-2 ${syncing ? "animate-spin" : ""}`}
        />
        {syncing ? "Syncing..." : "Sync Now"}
      </Button>

      <Button
        variant="outline"
        size="sm"
        onClick={seedData}
        disabled={loading}
        className="shadow-lg border-2 border-primary bg-background cursor-pointer"
      >
        <Database className="h-4 w-4 mr-2" />
        {loading ? "Seeding..." : "Seed Local DB"}
      </Button>
    </div>
  );
}
