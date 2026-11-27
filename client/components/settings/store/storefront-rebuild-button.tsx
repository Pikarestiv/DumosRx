import { Loader2, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useRebuildStorefront } from "@/lib/hooks/use-storefront-settings";

export function StorefrontRebuildButton() {
  const rebuild = useRebuildStorefront();

  return (
    <div className="flex flex-wrap items-center gap-3">
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={rebuild.isPending}
        onClick={() =>
          rebuild.mutate(undefined, {
            onSuccess: (response) => toast.success(response.message),
            onError: (error) => toast.error(error instanceof Error && error.message ? error.message : "Could not publish your changes"),
          })
        }
      >
        {rebuild.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
        Publish changes now
      </Button>
      <span className="text-xs text-muted-foreground">Your home page updates in a few minutes.</span>
    </div>
  );
}
