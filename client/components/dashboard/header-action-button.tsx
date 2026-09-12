import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";

interface HeaderActionButtonProps {
  action: { label: string; path: string };
  size?: "default" | "compact";
  /** "outline" is for the secondary action shown before the primary one
   * (desktop only — see DashboardHeader); it skips the "+" icon since a
   * secondary action isn't necessarily a "create" action (e.g. Start Audit). */
  variant?: "default" | "outline";
}

/** The header's route-driven "+ Add X" button (see dashboard-page-routes.ts),
 * rendered in a larger desktop-inline style or a compact mobile pill. */
export function HeaderActionButton({ action, size = "default", variant = "default" }: HeaderActionButtonProps) {
  const router = useRouter();

  if (size === "compact") {
    return (
      <Button
        variant={variant}
        size="sm"
        className="rounded-full h-8 px-4 text-xs font-semibold"
        onClick={() => router.push(action.path)}
      >
        {variant === "default" && <Plus className="h-3.5 w-3.5 mr-1" />}
        {action.label}
      </Button>
    );
  }

  return (
    <Button variant={variant} onClick={() => router.push(action.path)}>
      {variant === "default" && <Plus className="h-4 w-4" />}
      {action.label}
    </Button>
  );
}
