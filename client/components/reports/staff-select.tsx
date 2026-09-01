"use client";

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useUsers } from "@/lib/hooks/queries/use-users";

interface StaffSelectProps {
  value?: string;
  onChange: (staffId: string | undefined) => void;
  className?: string;
}

/** Filters a report/analytics query down to one cashier's sales - maps to
 * sales.user_id. Reuses the same staff list as Settings > Staff (useUsers),
 * not a bespoke query, so it always matches who's actually assigned to the
 * active store. */
export function StaffSelect({ value, onChange, className }: StaffSelectProps) {
  const { data: users = [] } = useUsers();
  const activeUsers = users.filter((u) => u.is_active);

  return (
    <Select
      value={value ?? "all"}
      onValueChange={(v) => onChange(v === "all" ? undefined : v)}
    >
      <SelectTrigger className={className ?? "w-[140px] h-9 text-[13px]"}>
        <SelectValue placeholder="Staff" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="all">All staff</SelectItem>
        {activeUsers.map((u) => (
          <SelectItem key={u.id} value={u.id}>
            {`${u.first_name} ${u.last_name ?? ""}`.trim()}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
