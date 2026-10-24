import { Key, KeyRound, Users } from "lucide-react";
import { TableCell, TableRow } from "@/components/ui/table";
import { EmptyState } from "@/components/ui/empty-state";

export function NoStaffFoundRow({
  isAdmin,
  onAddStaff,
}: {
  isAdmin: boolean;
  onAddStaff?: () => void;
}) {
  return (
    <TableRow>
      <TableCell colSpan={6} className="h-24">
        <EmptyState
          icon={Users}
          title="No staff members found"
          action={
            isAdmin && onAddStaff
              ? { label: "Add Staff Member", onClick: onAddStaff }
              : undefined
          }
        />
      </TableCell>
    </TableRow>
  );
}

export function PinBadge({ hasPin }: { hasPin: boolean }) {
  return (
    <span
      className={`inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded-full shrink-0 ${
        hasPin
          ? "text-emerald-600 bg-emerald-50 dark:bg-emerald-900/30"
          : "text-amber-600 bg-amber-50 dark:bg-amber-900/30"
      }`}
    >
      {hasPin ? <Key className="w-2.5 h-2.5" /> : <KeyRound className="w-2.5 h-2.5" />}
      {hasPin ? "PIN set" : "No PIN"}
    </span>
  );
}
