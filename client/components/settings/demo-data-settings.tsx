"use client";

import { useState } from "react";
import { FlaskConical, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useAuth } from "@/lib/context/auth-context";
import { useStore } from "@/lib/context/store-context";
import { runDemoSeed, isStoreSeedable } from "@/lib/demo/loader";
import { toast } from "sonner";

/** Only rendered for stores flagged `is_demo` by a superadmin (see the
 * "Mark as Demo" action in the web admin panel); never shown for a real
 * customer account. */
export function DemoDataSettings() {
  const { user } = useAuth();
  const { storeProfile } = useStore();
  const [showConfirm, setShowConfirm] = useState(false);
  const [loading, setLoading] = useState(false);

  if (!storeProfile?.is_demo) return null;

  const handleSeed = async () => {
    if (!user) return;
    setLoading(true);
    try {
      const seedable = await isStoreSeedable();
      const result = await runDemoSeed(user.id, { force: !seedable });
      if (result.ok) {
        toast.success("Demo data loaded", {
          description:
            "Products, procurement, sales, customers and expenses have been seeded.",
        });
      } else if (result.reason === "not_empty") {
        toast.error("Store already has data, seeding skipped.");
      } else {
        toast.error("Failed to seed demo data", { description: result.error });
      }
    } finally {
      setLoading(false);
      setShowConfirm(false);
    }
  };

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FlaskConical className="h-4 w-4" />
            Demo Data
          </CardTitle>
          <CardDescription>
            This account is flagged as a demo account. Load a full set of demo
            products, suppliers, purchase orders, sales, customers and expenses
            so it's ready to show.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between rounded-lg border gap-4 p-4">
            <div>
              <p className="text-sm font-medium">Seed Demo Data</p>
              <p className="text-xs text-muted-foreground">
                Safe to run on an empty store. Running it again on a store that
                already has data will ask for confirmation first.
              </p>
            </div>

            <Button
              size="sm"
              onClick={() => setShowConfirm(true)}
              disabled={loading}
            >
              {loading ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : null}
              Seed Demo Data
            </Button>
          </div>
        </CardContent>
      </Card>

      <ConfirmDialog
        open={showConfirm}
        onOpenChange={setShowConfirm}
        title="Seed Demo Data"
        description="This will create demo products, a supplier, purchase orders, sales, customers and expenses in this store. If the store already has data, this may add to it rather than replacing it."
        confirmLabel="Seed Demo Data"
        onConfirm={handleSeed}
      />
    </>
  );
}
