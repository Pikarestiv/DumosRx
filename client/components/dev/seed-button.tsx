/**
 * Dev utility to seed local SQLite with initial data
 */
"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Database } from "lucide-react";
import { toast } from "sonner";
import { insert } from "@/lib/db/local-database";

export function DevSeedButton() {
  const [loading, setLoading] = useState(false);

  const seedData = async () => {
    try {
      setLoading(true);

      // Seed Medicines
      insert("medicines", {
        id: "m1",
        name: "Paracetamol",
        brand: "Emzor",
        category: "Analgesics",
        stock_quantity: 500,
        status: "active",
      });
      insert("medicines", {
        id: "m2",
        name: "Amoxicillin",
        brand: "Beecham",
        category: "Antibiotics",
        stock_quantity: 120,
        status: "active",
      });
      insert("medicines", {
        id: "m3",
        name: "Vitamin C",
        brand: "Emzor",
        category: "Vitamins",
        stock_quantity: 50,
        status: "active",
        reorder_level: 100,
      });

      // Seed Sales (today)
      const today = new Date().toISOString();
      insert("sales", {
        id: "s1",
        total: 1500,
        created_at: today,
        payment_status: "completed",
      });
      insert("sales", {
        id: "s2",
        total: 2500,
        created_at: today,
        payment_status: "completed",
      });

      // Seed Customers
      insert("customers", {
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

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={seedData}
      disabled={loading}
      className="fixed bottom-4 right-4 z-50 shadow-lg border-2 border-primary"
    >
      <Database className="h-4 w-4 mr-2" />
      {loading ? "Seeding..." : "Seed Local DB"}
    </Button>
  );
}
