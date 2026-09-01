"use client";

import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAccountManagerCandidates } from "@/lib/api/admin-hooks-stores";
import { webApiClient } from "@/lib/api/client";

export function DefaultAccountManagerCard() {
  const { data: candidatesData } = useAccountManagerCandidates();
  const { data: currentId, isLoading } = useQuery({
    queryKey: ["default-account-manager-config"],
    queryFn: () => webApiClient.getSystemConfig("default_account_manager_id"),
  });
  const [selected, setSelected] = useState<string>("");
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (typeof currentId === "string") setSelected(currentId);
  }, [currentId]);

  const candidates = candidatesData?.data ?? [];

  const handleSave = async () => {
    if (!selected) return;
    setIsSaving(true);
    try {
      await webApiClient.updateSystemConfig("default_account_manager_id", selected);
      toast.success("Default contact specialist updated", {
        description: "Applies to any store with no referrer and no explicit assignment.",
      });
    } catch {
      toast.error("Failed to update the default contact specialist.");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="bg-white dark:bg-slate-900 border-2 border-slate-100 dark:border-slate-800 rounded-3xl p-6">
      <h3 className="text-lg font-black mb-1">Default Contact Specialist</h3>
      <p className="text-sm text-slate-500 dark:text-slate-400 mb-4 font-medium">
        Shown to any store with no referring platform staff and no explicit
        per-store assignment (see the Account Manager field on a store's
        detail view).
      </p>
      {isLoading ? (
        <p className="text-sm text-slate-500">Loading…</p>
      ) : (
        <div className="flex flex-col sm:flex-row gap-3 sm:items-center">
          <Select value={selected} onValueChange={setSelected}>
            <SelectTrigger className="rounded-xl w-full sm:w-72">
              {/* Short, explicit label - see store-dialogs.tsx's Account
                  Manager select for why (long unbreakable text otherwise
                  blows out a flex-based trigger's width). */}
              <SelectValue placeholder="Select a platform staff member">
                {candidates.find((c) => c.id === selected)?.name ??
                  "Select a platform staff member"}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {candidates.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.name} ({c.role})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            variant="outline"
            className="border-2 font-bold dark:bg-slate-900 dark:border-slate-800 w-fit"
            onClick={handleSave}
            disabled={isSaving || !selected}
          >
            Save Default
          </Button>
        </div>
      )}
    </div>
  );
}
