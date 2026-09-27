"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { STAFF_ROLES } from "@/lib/constants/roles";
import type { PermissionGroupRow } from "@/lib/hooks/use-permission-groups";

interface NewGroupDialogProps {
  mode: "new" | "copy";
  groups: PermissionGroupRow[];
  onClose: () => void;
  onCreateGroup: (name: string, basedOnRole: string) => Promise<void>;
  onCopyGroup: (sourceId: string, name: string) => Promise<void>;
}

export function NewGroupDialog({ mode, groups, onClose, onCreateGroup, onCopyGroup }: NewGroupDialogProps) {
  const [name, setName] = useState("");
  const [basedOnRole, setBasedOnRole] = useState<string>(STAFF_ROLES[1]?.value ?? "manager"); // default: Manager tier
  const [sourceGroupId, setSourceGroupId] = useState(groups[0]?.id ?? "");

  const handleSubmit = async () => {
    if (!name.trim()) return;
    if (mode === "new") await onCreateGroup(name.trim(), basedOnRole);
    else if (sourceGroupId) await onCopyGroup(sourceGroupId, name.trim());
    onClose();
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{mode === "new" ? "New Group" : "Copy Group"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-medium">Group name</label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Supervisor" />
          </div>
          {mode === "new" ? (
            <div className="space-y-2">
              <label className="text-sm font-medium">Base privilege tier</label>
              <Select value={basedOnRole} onValueChange={setBasedOnRole}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {STAFF_ROLES.map((r) => (
                    <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : (
            <div className="space-y-2">
              <label className="text-sm font-medium">Copy permissions from</label>
              <Select value={sourceGroupId} onValueChange={setSourceGroupId}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {groups.map((g) => (
                    <SelectItem key={g.id} value={g.id}>{g.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSubmit}>{mode === "new" ? "Create" : "Copy"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
