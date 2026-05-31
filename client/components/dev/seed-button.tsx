/**
 * Dev utility – seed and reset local SQLite with sample data.
 * Opens dialogs for selective seeding or resetting per category.
 */
"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { sync } from "@/lib/db/sync-engine";
import { RefreshCw, Database, Loader2, Check, Trash2, AlertTriangle } from "lucide-react";
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
  seedProcurement,
  seedPrescriptions,
  resetMedicines,
  resetSuppliers,
  resetExpenses,
  resetSales,
  resetCustomers,
  resetUsers,
  resetProcurement,
  resetPrescriptions,
  resetAll,
  SEED_CATEGORIES,
  type SeedKey,
} from "./seed-data";

export function DevSeedButton() {
  const [syncing, setSyncing] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [isResetOpen, setIsResetOpen] = useState(false);
  
  const [seeding, setSeeding] = useState<Partial<Record<SeedKey, boolean>>>({});
  const [done, setDone] = useState<Partial<Record<SeedKey, boolean>>>({});
  
  const [resetting, setResetting] = useState<Partial<Record<SeedKey, boolean>>>({});
  const [resetDone, setResetDone] = useState<Partial<Record<SeedKey, boolean>>>({});
  const [resettingAll, setResettingAll] = useState(false);

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
        case "procurement": await seedProcurement(); break;
        case "prescriptions": await seedPrescriptions(); break;
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

  const runReset = async (key: SeedKey) => {
    setResetting((s) => ({ ...s, [key]: true }));
    setResetDone((d) => ({ ...d, [key]: false }));
    try {
      switch (key) {
        case "medicines": await resetMedicines(); break;
        case "suppliers": await resetSuppliers(); break;
        case "expenses": await resetExpenses(); break;
        case "sales": await resetSales(); break;
        case "customers": await resetCustomers(); break;
        case "users": await resetUsers(); break;
        case "procurement": await resetProcurement(); break;
        case "prescriptions": await resetPrescriptions(); break;
      }
      setResetDone((d) => ({ ...d, [key]: true }));
      toast.success(`${SEED_CATEGORIES.find((c) => c.key === key)?.label} reset successfully`);
    } catch (err) {
      console.error(err);
      toast.error(`Failed to reset ${key}`);
    } finally {
      setResetting((s) => ({ ...s, [key]: false }));
    }
  };

  const runResetAll = async () => {
    setResettingAll(true);
    try {
      await resetAll();
      localStorage.clear();
      toast.success("Database fully reset");
      setTimeout(() => {
        window.location.reload();
      }, 1000);
    } catch (err) {
      console.error(err);
      toast.error("Failed to fully reset database");
    } finally {
      setResettingAll(false);
    }
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
  const anyResetting = Object.values(resetting).some(Boolean) || resettingAll;

  return (
    <>
      <div className="flex flex-wrap gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={handleSync}
          disabled={syncing}
          className="border border-primary bg-background cursor-pointer"
        >
          <RefreshCw className={`h-4 w-4 mr-2 ${syncing ? "animate-spin" : ""}`} />
          {syncing ? "Syncing..." : "Sync Now"}
        </Button>

        <Button
          variant="destructive"
          size="sm"
          onClick={() => setIsResetOpen(true)}
          className="border border-destructive bg-background hover:bg-destructive/10 text-destructive cursor-pointer"
        >
          Reset DB
        </Button>

        <Button
          variant="outline"
          size="sm"
          onClick={() => setIsOpen(true)}
          className="border border-primary bg-background cursor-pointer"
        >
          <Database className="h-4 w-4 mr-2" />
          Seed DB
        </Button>
      </div>

      {/* Seed Dialog */}
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

      {/* Reset Dialog */}
      <Dialog open={isResetOpen} onOpenChange={setIsResetOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <Trash2 className="h-5 w-5 text-destructive" />
              Reset Local Database
            </DialogTitle>
            <DialogDescription>
              Selectively wipe categories of local data. Resetting everything will clean all tables and clear storage.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2 py-2">
            {SEED_CATEGORIES.map((cat) => {
              const isResetting = resetting[cat.key];
              const isDone = resetDone[cat.key];
              return (
                <div
                  key={cat.key}
                  className="flex items-center justify-between p-3 rounded-lg border border-destructive/20 bg-destructive/5 hover:bg-destructive/10 transition-colors"
                >
                  <div className="flex-1 min-w-0 mr-3">
                    <p className="font-medium text-sm text-destructive-foreground">{cat.label}</p>
                    <p className="text-xs text-muted-foreground truncate">{cat.description}</p>
                  </div>
                  <Button
                    size="sm"
                    variant={isDone ? "secondary" : "destructive"}
                    disabled={isResetting || anyResetting}
                    onClick={() => runReset(cat.key)}
                    className="shrink-0 cursor-pointer"
                  >
                    {isResetting ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : isDone ? (
                      <Check className="h-3.5 w-3.5 text-green-600" />
                    ) : (
                      "Reset"
                    )}
                  </Button>
                </div>
              );
            })}
          </div>

          <div className="pt-2 border-t flex flex-col gap-2">
            <div className="flex items-start gap-2 p-2.5 rounded-lg border border-yellow-500/30 bg-yellow-500/5 text-yellow-600 text-xs">
              <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
              <p>Resetting all will clear your local storage and refresh the page to establish a clean database state.</p>
            </div>
            <Button
              variant="destructive"
              className="w-full cursor-pointer mt-1"
              onClick={runResetAll}
              disabled={anyResetting}
            >
              {resettingAll ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Resetting All...
                </>
              ) : (
                <>
                  <Trash2 className="h-4 w-4 mr-2" />
                  Reset Everything
                </>
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
