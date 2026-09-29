"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { useFeatureGate } from "@/lib/hooks/use-feature-gate";
import { NewGroupDialog } from "./new-group-dialog";
import type { PermissionGroupRow } from "@/lib/hooks/use-permission-groups";

interface GroupToolbarProps {
  groups: PermissionGroupRow[];
  onCreateGroup: (name: string, basedOnRole: string) => Promise<void>;
  onCopyGroup: (sourceId: string, name: string) => Promise<void>;
  onRevertToDefault: (groupId: string) => Promise<void>;
  onRenameGroup: (groupId: string, name: string) => Promise<void>;
  onDeleteGroup: (groupId: string) => Promise<void>;
}

export function GroupToolbar({ groups, onCreateGroup, onCopyGroup }: GroupToolbarProps) {
  const { canCreateCustomPermissionGroups, withRestriction } = useFeatureGate();
  const [dialogMode, setDialogMode] = useState<"new" | "copy" | null>(null);

  return (
    <div className="flex flex-wrap gap-2">
      <Button
        variant="outline"
        onClick={withRestriction(() => setDialogMode("new"), {
          featureAllowed: canCreateCustomPermissionGroups,
          featureKey: "custom_permission_groups",
        })}
      >
        New Group
      </Button>
      <Button
        variant="outline"
        onClick={withRestriction(() => setDialogMode("copy"), {
          featureAllowed: canCreateCustomPermissionGroups,
          featureKey: "custom_permission_groups",
        })}
      >
        Copy Group
      </Button>
      {dialogMode && (
        <NewGroupDialog
          mode={dialogMode}
          groups={groups}
          onClose={() => setDialogMode(null)}
          onCreateGroup={onCreateGroup}
          onCopyGroup={onCopyGroup}
        />
      )}
    </div>
  );
}
