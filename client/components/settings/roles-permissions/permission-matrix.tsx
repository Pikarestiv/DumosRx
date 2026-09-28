"use client";

import { Fragment, useMemo, useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { PERMISSION_CATALOG, ENFORCED_PERMISSION_KEYS } from "@/lib/constants/permissions";
import { Badge } from "@/components/ui/badge";
import { usePermissionGroups } from "@/lib/hooks/use-permission-groups";
import { useHasPermission, useOwnPermissionGroupId } from "@/lib/hooks/use-permissions";
import { GroupToolbar } from "./group-toolbar";
import { GroupColumnActions } from "./group-column-actions";
import { getCategoryCheckState, getCategoryToggleKeys, getCategoryToggleTarget } from "./category-selection";

/** A user who isn't store_owner/super_admin has no unconditional bypass in
 * hasPermission(), so unticking manage_roles_permissions on their own
 * group would lock them out of this very panel with no way back in from
 * their own device. The cell stays visible (and ticked) but is not
 * editable, mirroring the self-edit protection the sync layer already
 * applies to a user's own role/permission_group_id. */
const SELF_LOCKOUT_KEY = "manage_roles_permissions";

export function PermissionMatrix() {
  const canManage = useHasPermission("manage_roles_permissions");
  const ownGroupId = useOwnPermissionGroupId();
  const { groups, toggle, toggleMany, createGroup, copyGroup, revertToDefault, renameGroup, deleteGroup } =
    usePermissionGroups();
  // Categories start expanded: the matrix's whole job is being scannable at
  // a glance, so nothing is hidden behind a click until the admin chooses to
  // fold a section away.
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  const categories = useMemo(() => {
    const map = new Map<string, typeof PERMISSION_CATALOG>();
    for (const entry of PERMISSION_CATALOG) {
      if (!map.has(entry.category)) map.set(entry.category, []);
      map.get(entry.category)!.push(entry);
    }
    return Array.from(map.entries());
  }, []);

  if (!canManage) {
    return <p className="text-sm text-muted-foreground">You don't have permission to manage roles & permissions.</p>;
  }

  return (
    <div className="space-y-4">
      <GroupToolbar
        groups={groups}
        onCreateGroup={createGroup}
        onCopyGroup={copyGroup}
        onRevertToDefault={revertToDefault}
        onRenameGroup={renameGroup}
        onDeleteGroup={deleteGroup}
      />
      <div className="max-h-[70vh] overflow-auto  border-1 border-red-500">
        <table className="w-full text-sm">
          <thead>
            <tr>
              <th className="text-left p-2 sticky left-0 top-0 z-20 bg-muted">Permission</th>
              {groups.map((g) => (
                <th key={g.id} className="p-2 text-center whitespace-nowrap sticky top-0 z-10 bg-muted">
                  <div className="flex items-center justify-center gap-1">
                    <span>{g.name}</span>
                    <GroupColumnActions
                      group={g}
                      onRevertToDefault={revertToDefault}
                      onRenameGroup={renameGroup}
                      onDeleteGroup={deleteGroup}
                    />
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {categories.map(([category, entries]) => {
              const isCollapsed = collapsed[category] === true;
              const categoryKeys = entries.map((e) => e.key);
              return (
                <Fragment key={category}>
                  <tr className="border-t bg-muted/40">
                    <td className="pt-3 pb-2 px-2 sticky left-0 z-10 bg-muted/40">
                      <button
                        type="button"
                        onClick={() => setCollapsed((prev) => ({ ...prev, [category]: !isCollapsed }))}
                        aria-expanded={!isCollapsed}
                        aria-label={`${isCollapsed ? "Expand" : "Collapse"} ${category}`}
                        className="flex items-center gap-1.5 font-semibold text-muted-foreground hover:text-foreground"
                      >
                        {isCollapsed ? <ChevronRight className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                        {category}
                        <span className="text-xs font-normal">({entries.length})</span>
                      </button>
                    </td>
                    {groups.map((g) => {
                      const state = getCategoryCheckState(categoryKeys, g.permissions);
                      const lockedKeys =
                        g.id === ownGroupId && g.permissions.includes(SELF_LOCKOUT_KEY) ? [SELF_LOCKOUT_KEY] : [];
                      return (
                        <td key={g.id} className="pt-3 pb-2 px-2 text-center">
                          <input
                            type="checkbox"
                            data-testid="category-checkbox"
                            data-state={state}
                            checked={state === "checked"}
                            ref={(el) => {
                              if (el) el.indeterminate = state === "indeterminate";
                            }}
                            onChange={() =>
                              void toggleMany(
                                g.id,
                                getCategoryToggleKeys(categoryKeys, lockedKeys),
                                getCategoryToggleTarget(state),
                              )
                            }
                            aria-label={`${category} - all permissions - ${g.name}`}
                          />
                        </td>
                      );
                    })}
                  </tr>
                  {!isCollapsed &&
                    entries.map((entry) => (
                      <tr key={entry.key} className="border-t">
                        <td className="p-2 pl-7 sticky left-0 z-10 bg-background">
                          {entry.label}
                          {!ENFORCED_PERMISSION_KEYS.has(entry.key) && (
                            <Badge
                              variant="outline"
                              data-testid="not-yet-enforced"
                              title="This permission is coming in a future update. Your choice is saved now, and will start granting or restricting access as soon as it's available."
                              className="ml-2 h-5 px-1.5 text-[10px] font-normal text-muted-foreground"
                            >
                              Coming soon
                            </Badge>
                          )}
                        </td>
                        {groups.map((g) => {
                          const granted = g.permissions.includes(entry.key);
                          const locked = entry.key === SELF_LOCKOUT_KEY && g.id === ownGroupId && granted;
                          return (
                            <td key={g.id} className="p-2 text-center">
                              <input
                                type="checkbox"
                                checked={granted}
                                disabled={locked}
                                title={
                                  locked
                                    ? "You can't remove your own access to Roles & Permissions - ask the store owner or another admin to change this."
                                    : undefined
                                }
                                onChange={(e) => toggle(g.id, entry.key, e.target.checked)}
                                aria-label={`${entry.label} - ${g.name}`}
                              />
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
