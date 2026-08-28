import { ArrowUp, ArrowDown, ArrowUpDown } from "lucide-react";

interface SortableHeaderCellProps {
  label: string;
  active: boolean;
  direction: "asc" | "desc";
  onClick: () => void;
  className?: string;
}

/** Shared "click to sort, click again to flip direction" header cell -
 * reused across every sortable table (see lib/hooks/use-sortable-data.ts)
 * so the interaction and indicator icon stay consistent app-wide. */
export function SortableHeaderCell({
  label,
  active,
  direction,
  onClick,
  className = "",
}: SortableHeaderCellProps) {
  const Icon = active ? (direction === "asc" ? ArrowUp : ArrowDown) : ArrowUpDown;

  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-center gap-1 hover:text-foreground transition-colors ${active ? "text-foreground" : ""} ${className}`}
    >
      {label}
      <Icon className={`h-3 w-3 shrink-0 ${active ? "" : "opacity-40"}`} />
    </button>
  );
}
