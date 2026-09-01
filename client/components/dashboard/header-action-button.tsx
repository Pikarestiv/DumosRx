import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";

interface HeaderActionButtonProps {
  action: { label: string; path: string };
  size?: "default" | "compact";
}

/** The header's route-driven "+ Add X" button (see dashboard-page-routes.ts),
 * rendered in a larger desktop-inline style or a compact mobile pill. */
export function HeaderActionButton({ action, size = "default" }: HeaderActionButtonProps) {
  const router = useRouter();

  if (size === "compact") {
    return (
      <Button
        size="sm"
        className="rounded-full h-8 px-4 text-xs font-semibold"
        onClick={() => router.push(action.path)}
      >
        <Plus className="h-3.5 w-3.5 mr-1" />
        {action.label}
      </Button>
    );
  }

  return (
    <Button onClick={() => router.push(action.path)}>
      <Plus className="h-4 w-4" />
      {action.label}
    </Button>
  );
}
