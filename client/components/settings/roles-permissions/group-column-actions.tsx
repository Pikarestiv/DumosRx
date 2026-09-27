"use client";

import { useState } from "react";
import { RotateCcw, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import type { PermissionGroupRow } from "@/lib/hooks/use-permission-groups";

interface GroupColumnActionsProps {
  group: PermissionGroupRow;
  onRevertToDefault: (groupId: string) => Promise<void>;
  onRenameGroup: (groupId: string, name: string) => Promise<void>;
  onDeleteGroup: (groupId: string) => Promise<void>;
}

/** Per-group column header actions in the Roles & Permissions matrix -
 * Revert to Default for a default group (its permissions can be edited
 * but its name/identity can't, per Global Constraints), Rename/Delete for
 * a custom group. Never both on the same group. */
export function GroupColumnActions({ group, onRevertToDefault, onRenameGroup, onDeleteGroup }: GroupColumnActionsProps) {
  const [confirmRevert, setConfirmRevert] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [name, setName] = useState(group.name);

  if (group.is_default) {
    return (
      <>
        <Button
          variant="ghost"
          size="icon"
          aria-label={`Revert ${group.name} to default`}
          onClick={() => setConfirmRevert(true)}
        >
          <RotateCcw className="h-4 w-4" />
        </Button>
        <ConfirmDialog
          open={confirmRevert}
          onOpenChange={setConfirmRevert}
          title="Revert to default?"
          description={`This restores ${group.name}'s original permission set. Any custom changes will be lost.`}
          confirmLabel="Revert"
          onConfirm={async () => {
            await onRevertToDefault(group.id);
          }}
        />
      </>
    );
  }

  return (
    <>
      <Button
        variant="ghost"
        size="icon"
        aria-label={`Rename ${group.name}`}
        onClick={() => {
          setName(group.name);
          setRenaming(true);
        }}
      >
        <Pencil className="h-4 w-4" />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        aria-label={`Delete ${group.name}`}
        onClick={() => setConfirmDelete(true)}
      >
        <Trash2 className="h-4 w-4" />
      </Button>

      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title="Delete group?"
        description={`"${group.name}" will be removed. Staff assigned to it must be reassigned first.`}
        confirmLabel="Delete"
        onConfirm={async () => {
          try {
            await onDeleteGroup(group.id);
          } catch (error) {
            toast.error(error instanceof Error ? error.message : "Failed to delete group");
          }
        }}
      />

      <Dialog open={renaming} onOpenChange={setRenaming}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rename group</DialogTitle>
          </DialogHeader>
          <Input
            data-testid="rename-group-input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            aria-label="Group name"
          />
          <DialogFooter>
            <Button variant="ghost" onClick={() => setRenaming(false)}>Cancel</Button>
            <Button
              data-testid="submit-rename-group"
              onClick={async () => {
                if (!name.trim()) return;
                await onRenameGroup(group.id, name.trim());
                setRenaming(false);
              }}
            >
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
