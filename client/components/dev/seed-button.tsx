/**
 * Dev utility – seed local SQLite with sample data.
 * Opens a dialog for selective seeding per category.
 */
"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { sync } from "@/lib/db/sync-engine";
import { RefreshCw, Database, Loader2, Check } from "lucide-react";
import { toast } from "sonner";
import { useAuthStore } from "@/lib/auth/store";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  seedMedicines,
  seedSuppliers,
  seedExpenses,
  seedSales,
  seedCustomers,
  seedUsers,
} from "./seed-data";

type SeedKey = "medicines" | "suppliers" | "expenses" | "sales" | "customers" | "users";

const SEED_CATEGORIES: { key: SeedKey; label: string; description: string }[] = [
  { key: "medicines", label: "Medicines", description: "3 sample medicines (Paracetamol, Amoxicillin, Vitamin C)" },
  { key: "suppliers", label: "Suppliers", description: "2 sample suppliers (Emzor, GSK Nigeria)" },
  { key: "expenses", label: "Expenses", description: "1 sample rent expense" },
  { key: "sales", label: "Sales", description: "2 sample completed sales transactions" },
  { key: "customers", label: "Customers", description: "1 sample customer (John Doe)" },
  { key: "users", label: "Staff Users", description: "1 default admin user (admin / 1234)" },
];

export function DevSeedButton() {
  const [syncing, setSyncing] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [seeding, setSeeding] = useState<Partial<Record<SeedKey, boolean>>>({});
  const [done, setDone] = useState<Partial<Record<SeedKey, boolean>>>({});

  const getCashierId = () => {
    const user = useAuthStore.getState().user;
    return user?.id || "u1";
  };

  const runSeed = async (key: SeedKey) => {
    setSeeding((s) => ({ ...s, [key]: true }));
    setDone((d) => ({ ...d, [key]: false }));
    try {
      const cashierId = getCashierId();
      switch (key) {
        case "medicines": await seedMedicines(); break;
        case "suppliers": await seedSuppliers(); break;
        case "expenses": await seedExpenses(); break;
        case "sales": await seedSales(cashierId); break;
        case "customers": await seedCustomers(); break;
        case "users": await seedUsers(); break;
      }
      setDone((d) => ({ ...d, [key]: true }));
      toast.success(`${SEED_CATEGORIES.find((c) => c.key === key)?.label} seeded successfully`);
    } catch (err) {
      console.error(err);
      toast.error(`Failed to seed ${key}`);
    } finally {
      setSeeding((s) => ({ ...s, [key]: false }));
    }
  };

  const runSeedAll = async () => {
    for (const category of SEED_CATEGORIES) {
      await runSeed(category.key);
    }
    toast.success("All categories seeded");
  };

  const handleSync = async () => {
    try {
      setSyncing(true);
      const result = await sync();
      if (result.success) {
        toast.success(`Sync Complete: Pushed ${result.pushed}, Pulled ${result.pulled}`);
      } else {
        toast.error("Sync failed");
      }
    } finally {
      setSyncing(false);
    }
  };

  const anySeeding = Object.values(seeding).some(Boolean);

  return (
    <>
      <div className="fixed bottom-4 right-4 z-50 flex gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={handleSync}
          disabled={syncing}
          className="shadow-lg border-2 border-primary bg-background cursor-pointer"
        >
          <RefreshCw className={`h-4 w-4 mr-2 ${syncing ? "animate-spin" : ""}`} />
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
          onClick={() => setIsOpen(true)}
          className="shadow-lg border-2 border-primary bg-background cursor-pointer"
        >
          <Database className="h-4 w-4 mr-2" />
          Seed DB
        </Button>
      </div>

      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Database className="h-5 w-5 text-primary" />
              Seed Local Database
            </DialogTitle>
            <DialogDescription>
              Choose which categories to populate with sample data. Existing seed records will be replaced.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2 py-2">
            {SEED_CATEGORIES.map((cat) => {
              const isSeeding = seeding[cat.key];
              const isDone = done[cat.key];
              return (
                <div
                  key={cat.key}
                  className="flex items-center justify-between p-3 rounded-lg border bg-muted/30 hover:bg-muted/50 transition-colors"
                >
                  <div className="flex-1 min-w-0 mr-3">
                    <p className="font-medium text-sm">{cat.label}</p>
                    <p className="text-xs text-muted-foreground truncate">{cat.description}</p>
                  </div>
                  <Button
                    size="sm"
                    variant={isDone ? "secondary" : "outline"}
                    disabled={isSeeding || anySeeding}
                    onClick={() => runSeed(cat.key)}
                    className="shrink-0 cursor-pointer"
                  >
                    {isSeeding ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : isDone ? (
                      <Check className="h-3.5 w-3.5 text-green-600" />
                    ) : (
                      "Seed"
                    )}
                  </Button>
                </div>
              );
            })}
          </div>

          <div className="pt-2 border-t">
            <Button
              className="w-full cursor-pointer"
              onClick={runSeedAll}
              disabled={anySeeding}
            >
              {anySeeding ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Seeding...
                </>
              ) : (
                <>
                  <Database className="h-4 w-4 mr-2" />
                  Seed Everything
                </>
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
