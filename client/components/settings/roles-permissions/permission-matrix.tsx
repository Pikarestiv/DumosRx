"use client";

import { Fragment, useMemo, useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { PERMISSION_CATALOG, ENFORCED_PERMISSION_KEYS } from "@/lib/constants/permissions";
import { Badge } from "@/components/ui/badge";
import { ScrollFade } from "@/components/ui/scroll-fade";
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

  // One template string, built once and spread onto the header row and every
  // body row, so header and body columns can't drift out of alignment.
  const gridStyle = {
    gridTemplateColumns: `minmax(min(45vw,220px),1.5fr) repeat(${groups.length},minmax(110px,1fr))`,
  };

  return (
    <div className="flex h-full min-h-0 flex-col gap-4">
      <GroupToolbar
        groups={groups}
        onCreateGroup={createGroup}
        onCopyGroup={copyGroup}
        onRevertToDefault={revertToDefault}
        onRenameGroup={renameGroup}
        onDeleteGroup={deleteGroup}
      />
      <ScrollFade containerClassName="flex-1 min-h-0" className="overflow-x-auto">
        <div role="table" aria-label="Role permissions" className="min-w-max text-sm">
          <div role="rowgroup" className="sticky top-0 z-20 bg-muted">
            <div role="row" className="grid" style={gridStyle}>
              <div role="columnheader" className="sticky left-0 z-10 bg-muted p-2 text-left font-medium">
                Permission
              </div>
              {groups.map((g) => (
                <div key={g.id} role="columnheader" className="p-2 text-center font-medium whitespace-nowrap">
                  <div className="flex items-center justify-center gap-1">
                    <span>{g.name}</span>
                    <GroupColumnActions
                      group={g}
                      onRevertToDefault={revertToDefault}
                      onRenameGroup={renameGroup}
                      onDeleteGroup={deleteGroup}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div role="rowgroup">
            {categories.map(([category, entries]) => {
              const isCollapsed = collapsed[category] === true;
              const categoryKeys = entries.map((e) => e.key);
              return (
                <Fragment key={category}>
                  <div role="row" className="grid border-t bg-muted" style={gridStyle}>
                    <div role="cell" className="sticky left-0 z-10 bg-muted px-2 pt-3 pb-2">
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
                    </div>
                    {groups.map((g) => {
                      const state = getCategoryCheckState(categoryKeys, g.permissions);
                      const lockedKeys =
                        g.id === ownGroupId && g.permissions.includes(SELF_LOCKOUT_KEY) ? [SELF_LOCKOUT_KEY] : [];
                      return (
                        <div key={g.id} role="cell" className="flex items-center justify-center px-2 pt-3 pb-2">
                          <input
                            type="checkbox"
                            data-testid="category-checkbox"
                            data-state={state}
                            className="h-4 w-4 shrink-0 rounded border-gray-300 text-primary focus:ring-primary accent-primary cursor-pointer"
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
                        </div>
                      );
                    })}
                  </div>
                  {!isCollapsed &&
                    entries.map((entry) => (
                      <div key={entry.key} role="row" className="grid border-t" style={gridStyle}>
                        <div role="cell" className="sticky left-0 z-10 flex items-center bg-background p-2 pl-7">
                          {entry.label}
                          {!ENFORCED_PERMISSION_KEYS.has(entry.key) && (
                            <Badge
                              variant="outline"
                              data-testid="not-yet-enforced"
                              title="This permission is coming in a future update. Your choice is saved now, and will start granting or restricting access as soon as it's available."
                              className="ml-2 h-5 shrink-0 px-1.5 text-[10px] font-normal text-muted-foreground"
                            >
                              Coming soon
                            </Badge>
                          )}
                        </div>
                        {groups.map((g) => {
                          const granted = g.permissions.includes(entry.key);
                          const locked = entry.key === SELF_LOCKOUT_KEY && g.id === ownGroupId && granted;
                          return (
                            <div key={g.id} role="cell" className="flex items-center justify-center p-2">
                              <input
                                type="checkbox"
                                className="h-4 w-4 shrink-0 rounded border-gray-300 text-primary focus:ring-primary accent-primary cursor-pointer disabled:cursor-not-allowed disabled:opacity-60"
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
                            </div>
                          );
                        })}
                      </div>
                    ))}
                </Fragment>
              );
            })}
          </div>
        </div>
      </ScrollFade>
    </div>
  );
}
