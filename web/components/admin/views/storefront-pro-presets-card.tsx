"use client";

import { useState } from "react";
import { Loader2, Palette, Save } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import {
  previewStorefrontProPresets,
  useStorefrontProPresets,
  useUpdateStorefrontProPresetsMutation,
} from "@/lib/api/admin-hooks-storefront";
import { getStorefrontPreset } from "@/lib/storefront-presets";

const label = (id: string | null | undefined) => (id ? (getStorefrontPreset(id)?.label ?? id) : "the first allowed style");
const storefronts = (count: number) => `${count} Pro storefront${count === 1 ? "" : "s"}`;

export function StorefrontProPresetsCard() {
  const { data, isLoading } = useStorefrontProPresets();
  const update = useUpdateStorefrontProPresetsMutation();
  const [edited, setEdited] = useState<string[] | null>(null);
  const [checking, setChecking] = useState(false);
  const [pendingSwitch, setPendingSwitch] = useState<{ count: number; to: string | null } | null>(null);

  if (isLoading || !data) {
    return isLoading ? <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /> : null;
  }

  const chosen = edited ?? data.allowed;
  const ordered = data.presets.filter((id) => chosen.includes(id));
  const removesUsedPreset = data.allowed.some((id) => !chosen.includes(id) && (data.affected[id] ?? 0) > 0);

  const toggle = (id: string, on: boolean) => setEdited(on ? [...chosen, id] : chosen.filter((preset) => preset !== id));

  const save = () =>
    update.mutate(ordered, {
      onSuccess: (result) => {
        setEdited(null);
        toast.success(`Pro presets saved. ${storefronts(result.stores_switched)} switched.`);
      },
      onError: (error) => toast.error(error instanceof Error ? error.message : "Could not save the Pro presets"),
    });

  const handleSave = async () => {
    if (!removesUsedPreset) return save();
    setChecking(true);
    try {
      const fresh = await previewStorefrontProPresets(ordered);
      if (fresh.switching && fresh.switching.count > 0) setPendingSwitch(fresh.switching);
      else save();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not check which storefronts would switch");
    } finally {
      setChecking(false);
    }
  };

  return (
    <Card className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Palette className="h-5 w-5 text-primary" />
          Pro storefront presets
        </CardTitle>
        <CardDescription>
          The styles a Pro storefront may use. Enterprise always gets every style, including new ones. A Pro storefront on a style you remove keeps its saved choice and is shown the first ticked style until the owner upgrades.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3 sm:grid-cols-2">
        {data.presets.map((id) => (
          <div key={id} className="flex items-center justify-between gap-3 rounded-2xl border border-slate-200 p-3 dark:border-slate-800">
            <div className="flex items-center gap-2">
              <Checkbox id={`pro-preset-${id}`} checked={chosen.includes(id)} onCheckedChange={(state) => toggle(id, state === true)} />
              <label htmlFor={`pro-preset-${id}`} className="text-sm font-medium">
                {label(id)}
              </label>
            </div>
            <span className="text-xs text-muted-foreground">{storefronts(data.affected[id] ?? 0)}</span>
          </div>
        ))}
      </CardContent>
      <CardFooter className="flex items-center justify-between gap-3 border-t p-4">
        <span className="text-xs text-muted-foreground">
          {ordered.length === 0 ? "Tick at least one style." : `Default: ${data.default.map((id) => label(id)).join(", ")}.`}
        </span>
        <Button onClick={() => void handleSave()} disabled={ordered.length === 0 || update.isPending || checking}>
          {update.isPending || checking ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
          Save Pro presets
        </Button>
      </CardFooter>
      <ConfirmDialog
        open={pendingSwitch !== null}
        onOpenChange={(open) => !open && setPendingSwitch(null)}
        title="Switch Pro storefronts to another style?"
        description={pendingSwitch ? `${storefronts(pendingSwitch.count)} will switch to ${label(pendingSwitch.to)} at their next rebuild. Their saved style comes back if they upgrade to Enterprise.` : ""}
        confirmLabel="Switch them"
        variant="default"
        onConfirm={save}
      />
    </Card>
  );
}
