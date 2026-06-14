"use client";

import { useState } from "react";
import { ConfirmationModal } from "@/components/dashboard/confirmation-modal";
import { AlertTriangle, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { toast } from "sonner";

interface OverviewDangerZoneProps {
  onReset: (type: string) => Promise<any>;
}

export function OverviewDangerZone({ onReset }: OverviewDangerZoneProps) {
  const [resetConfig, setResetConfig] = useState<{
    isOpen: boolean;
    type: string;
    title: string;
    description: string;
  }>({
    isOpen: false,
    type: "all",
    title: "",
    description: "",
  });

  const handleResetClick = (type: string) => {
    const configs: Record<string, { title: string; description: string }> = {
      sales: {
        title: "Clear Sales Records",
        description: "Are you sure you want to delete all sales history? This action cannot be undone.",
      },
      logs: {
        title: "Clear Activity Logs",
        description: "This will permanently delete all activity and system logs for your account.",
      },
      inventory: {
        title: "Clear Inventory",
        description: "Are you sure you want to wipe your online inventory stock? You will need to re-sync from your terminals.",
      },
      customers: {
        title: "Clear Customers",
        description: "This will delete all customer records from the cloud database.",
      },
      stores: {
        title: "Clear Terminals",
        description: "Are you sure you want to delete all connected terminals? They will need to re-register to sync data.",
      },
      all: {
        title: "Full Account Reset",
        description: "WARNING: This will delete ALL data (Sales, Logs, Inventory, Customers). This is irreversible.",
      },
    };

    setResetConfig({
      isOpen: true,
      type,
      ...configs[type],
    });
  };

  const confirmReset = async () => {
    const res = await onReset(resetConfig.type);
    setResetConfig((prev) => ({ ...prev, isOpen: false }));
    if (res.success) {
      toast.success(res.message || "Data reset successfully");
    } else {
      toast.error(res.error || "Reset failed. Please try again.");
    }
  };

  return (
    <>
      <Card className="border-2 border-destructive/20 shadow-sm bg-destructive/5">
        <CardHeader>
          <CardTitle className="text-xl text-destructive flex items-center gap-2">
            <AlertTriangle className="h-5 w-5" />
            Danger Zone
          </CardTitle>
          <CardDescription>Actions here cannot be undone.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 lg:grid-cols-1 xl:grid-cols-2 gap-2">
            <Button 
              variant="outline" 
              size="sm"
              className="text-xs font-bold border-destructive/20 hover:bg-destructive hover:text-white"
              onClick={() => handleResetClick("sales")}
            >
              Clear Sales
            </Button>
            <Button 
              variant="outline" 
              size="sm"
              className="text-xs font-bold border-destructive/20 hover:bg-destructive hover:text-white"
              onClick={() => handleResetClick("logs")}
            >
              Clear Logs
            </Button>
            <Button 
              variant="outline" 
              size="sm"
              className="text-xs font-bold border-destructive/20 hover:bg-destructive hover:text-white"
              onClick={() => handleResetClick("inventory")}
            >
              Clear Inventory
            </Button>
            <Button 
              variant="outline" 
              size="sm"
              className="text-xs font-bold border-destructive/20 hover:bg-destructive hover:text-white"
              onClick={() => handleResetClick("customers")}
            >
              Clear Customers
            </Button>
            <Button 
              variant="outline" 
              size="sm"
              className="text-xs font-bold border-destructive/20 hover:bg-destructive hover:text-white"
              onClick={() => handleResetClick("stores")}
            >
              Clear Terminals
            </Button>
          </div>

          <Button 
            variant="destructive" 
            className="w-full font-bold gap-2"
            onClick={() => handleResetClick("all")}
          >
            <Trash2 className="h-4 w-4" />
            <span className="lg:hidden xl:inline">Nuke Everything (Full Reset)</span>
            <span className="hidden lg:inline xl:hidden">Nuke Everything</span>
          </Button>
        </CardContent>
      </Card>

      <ConfirmationModal
        isOpen={resetConfig.isOpen}
        onClose={() => setResetConfig((prev) => ({ ...prev, isOpen: false }))}
        onConfirm={confirmReset}
        title={resetConfig.title}
        description={resetConfig.description}
        variant="destructive"
        confirmText={resetConfig.type === "all" ? "Nuke Everything" : "Confirm Reset"}
      />
    </>
  );
}
