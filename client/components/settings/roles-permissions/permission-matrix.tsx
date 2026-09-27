"use client";

import { useMemo } from "react";
import { PERMISSION_CATALOG } from "@/lib/constants/permissions";
import { usePermissionGroups } from "@/lib/hooks/use-permission-groups";
import { useHasPermission } from "@/lib/hooks/use-permissions";
import { GroupToolbar } from "./group-toolbar";

export function PermissionMatrix() {
  const canManage = useHasPermission("manage_roles_permissions");
  const { groups, toggle, createGroup, copyGroup, revertToDefault, renameGroup, deleteGroup } = usePermissionGroups();

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
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr>
              <th className="text-left p-2">Permission</th>
              {groups.map((g) => (
                <th key={g.id} className="p-2 text-center whitespace-nowrap">
                  {g.name}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {categories.map(([category, entries]) => (
              <>
                <tr key={category}>
                  <td colSpan={groups.length + 1} className="pt-4 pb-1 font-semibold text-muted-foreground">
                    {category}
                  </td>
                </tr>
                {entries.map((entry) => (
                  <tr key={entry.key} className="border-t">
                    <td className="p-2">{entry.label}</td>
                    {groups.map((g) => (
                      <td key={g.id} className="p-2 text-center">
                        <input
                          type="checkbox"
                          checked={g.permissions.includes(entry.key)}
                          onChange={(e) => toggle(g.id, entry.key, e.target.checked)}
                          aria-label={`${entry.label} - ${g.name}`}
                        />
                      </td>
                    ))}
                  </tr>
                ))}
              </>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
