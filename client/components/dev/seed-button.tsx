/**
 * Dev utility to seed local SQLite with initial data
 */
"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { sync } from "@/lib/db/sync-engine";
import { RefreshCw, Database } from "lucide-react";
import { toast } from "sonner";
import { insert, execute } from "@/lib/db/local-database";
import { useAuthStore } from "@/lib/auth/store";

export function DevSeedButton() {
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);

  const seedData = async () => {
    try {
      setLoading(true);

      // Clean up previous mock data to avoid UNIQUE constraint errors
      await execute("DELETE FROM medicines WHERE id IN ('m1', 'm2', 'm3')");
      await execute("DELETE FROM suppliers WHERE id IN ('v1', 'v2')");
      await execute("DELETE FROM expenses WHERE id IN ('e1')");
      await execute("DELETE FROM sales WHERE id IN ('s1', 's2')");
      await execute("DELETE FROM customers WHERE id IN ('c1')");
      await execute("DELETE FROM users WHERE id IN ('u1')");

      // Seed Medicines with UoM
      await insert("medicines", {
        id: "m1",
        name: "Paracetamol",
        brand_name: "Emzor",
        category_id: "Analgesics",
        stock_quantity: 500,
        base_unit: "Tablet",
        bulk_unit: "Pack",
        units_per_bulk: 50,
        is_active: 1,
      });
      await insert("medicines", {
        id: "m2",
        name: "Amoxicillin",
        brand_name: "Beecham",
        category_id: "Antibiotics",
        stock_quantity: 120,
        base_unit: "Capsule",
        bulk_unit: "Carton",
        units_per_bulk: 100,
        is_active: 1,
      });
      await insert("medicines", {
        id: "m3",
        name: "Vitamin C",
        brand_name: "Emzor",
        category_id: "Vitamins",
        stock_quantity: 50,
        base_unit: "Sachet",
        is_active: 1,
        reorder_level: 100,
      });

      // Seed Vendors
      await insert("suppliers", {
        id: "v1",
        name: "Emzor Pharmaceuticals",
        contact_person: "Mr. Emeka",
        phone: "08033344455",
        payment_terms: "Net 30",
      });
      await insert("suppliers", {
        id: "v2",
        name: "GSK Nigeria",
        contact_person: "Sarah Okon",
        phone: "08099887766",
        payment_terms: "Pay on Delivery",
      });

      // Seed Expenses
      await insert("expenses", {
        id: "e1",
        category: "Rent",
        amount: 150000,
        description: "Monthly shop rent",
        date: new Date().toISOString().split('T')[0],
        payment_method: "Bank Transfer",
      });

      // Seed Sales (today)
      const today = new Date().toISOString();
      const user = useAuthStore.getState().user;
      const cashierId = user?.id || "u1";

      await insert("sales", {
        id: "s1",
        transaction_number: "TRX-SEED-001",
        user_id: cashierId,
        total_amount: 1500,
        amount_paid: 1500,
        change_given: 0,
        subtotal: 1500,
        tax_amount: 0,
        tax_percentage: 7.5,
        discount_total: 0,
        discount_percentage: 0,
        points_earned: 0,
        points_redeemed: 0,
        payment_method: "cash",
        created_at: today,
        transaction_date: today,
        payment_status: "completed",
        receipt_printed: 0,
      });
      await insert("sales", {
        id: "s2",
        transaction_number: "TRX-SEED-002",
        user_id: cashierId,
        total_amount: 2500,
        amount_paid: 2500,
        change_given: 0,
        subtotal: 2500,
        tax_amount: 0,
        tax_percentage: 7.5,
        discount_total: 0,
        discount_percentage: 0,
        points_earned: 0,
        points_redeemed: 0,
        payment_method: "card",
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

      // Seed Default Admin User
      await insert("users", {
        id: "u1",
        name: "Default Admin",
        username: "admin",
        email: "admin@dumosrx.com",
        pin: "1234",
        role: "admin",
        is_active: 1,
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
        variant="destructive"
        size="sm"
        onClick={() => {
          localStorage.clear();
          window.location.reload();
        }}
        className="shadow-lg border-2 border-destructive bg-background hover:bg-destructive/10 text-destructive cursor-pointer"
      >
        Reset DB
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
