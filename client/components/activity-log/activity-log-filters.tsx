"use client";

import { SearchInput } from "@/components/ui/search-input";
import { FilterPill } from "@/components/ui/filter-pill";
import {
  DateRangePicker,
  type DateRangeValue,
} from "@/components/ui/date-range-picker";
import { STAFF_ROLES } from "@/lib/constants/roles";
import { describeActionVerb } from "./describe-activity";

interface ActivityLogFiltersProps {
  search: string;
  onSearchChange: (value: string) => void;
  dateRange: DateRangeValue;
  onDateRangeChange: (value: DateRangeValue) => void;
  actionFilter: string;
  onActionFilterChange: (value: string) => void;
  actions: string[];
  canViewAll: boolean;
  roleFilter: string;
  onRoleFilterChange: (value: string) => void;
  userFilter: string;
  onUserFilterChange: (value: string) => void;
  users: { user_id: string; user_name: string | null }[];
}

export function ActivityLogFilters({
  search,
  onSearchChange,
  dateRange,
  onDateRangeChange,
  actionFilter,
  onActionFilterChange,
  actions,
  canViewAll,
  roleFilter,
  onRoleFilterChange,
  userFilter,
  onUserFilterChange,
  users,
}: ActivityLogFiltersProps) {
  return (
    <div className="p-4 border-b border-border space-y-3 shrink-0">
      <SearchInput
        value={search}
        onChange={onSearchChange}
        placeholder="Search by action, table, or staff member"
        inputClassName="bg-muted border-transparent"
      />

      <div className="flex flex-wrap gap-2">
        <DateRangePicker value={dateRange} onChange={onDateRangeChange} />

        <FilterPill
          label="Action"
          value={actionFilter}
          onValueChange={onActionFilterChange}
          options={[
            { value: "all", label: "All Actions" },
            ...actions.map((a) => ({
              value: a,
              label: describeActionVerb(a),
            })),
          ]}
        />

        {canViewAll && (
          <FilterPill
            label="Role"
            value={roleFilter}
            onValueChange={onRoleFilterChange}
            options={[
              { value: "all", label: "All Roles" },
              ...STAFF_ROLES.map((r) => ({
                value: r.value,
                label: r.label,
              })),
            ]}
          />
        )}

        {canViewAll && (
          <FilterPill
            label="Staff"
            value={userFilter}
            onValueChange={onUserFilterChange}
            options={[
              { value: "all", label: "Everyone" },
              ...users.map((u) => ({
                value: u.user_id,
                label: u.user_name || "Unknown",
              })),
            ]}
          />
        )}
      </div>
    </div>
  );
}
