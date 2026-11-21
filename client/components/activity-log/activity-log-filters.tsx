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
  isMobile?: boolean;
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
  isMobile,
}: ActivityLogFiltersProps) {
  return (
    <div
      className={
        isMobile
          ? "space-y-3 shrink-0"
          : "p-4 border-b border-border space-y-3 shrink-0"
      }
    >
      <SearchInput
        value={search}
        onChange={onSearchChange}
        placeholder="Search by action, table, or staff member"
        aria-label="Search activity log"
        inputClassName="bg-card border-border shadow-xs"
      />

      <div className="flex flex-wrap gap-2">
        <DateRangePicker
          value={dateRange}
          onChange={onDateRangeChange}
          className="bg-card border-border shadow-xs"
        />

        <FilterPill
          label="Action"
          value={actionFilter}
          onValueChange={onActionFilterChange}
          className="bg-card border-border shadow-xs"
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
            className="bg-card border-border shadow-xs"
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
            className="bg-card border-border shadow-xs"
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
