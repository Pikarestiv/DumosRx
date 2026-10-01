"use client";

import { useState } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { ShieldCheck, Trash2, Plus, Loader2, Save, Undo2 } from "lucide-react";
import { toast } from "sonner";
import {
  useAdminRoles,
  useUpdateRolePermissionsMutation,
  useCreateRoleMutation,
  useDeleteRoleMutation,
  type AdminRole,
} from "@/lib/api/admin-hooks-roles";
import { PLATFORM_PERMISSION_OPTIONS } from "@/lib/constants/platform-permissions";

export function AdminPermissionsCard() {
  const { data, isLoading } = useAdminRoles();
  const updatePermissionsMutation = useUpdateRolePermissionsMutation();
  const createRoleMutation = useCreateRoleMutation();
  const deleteRoleMutation = useDeleteRoleMutation();

  const [isCreating, setIsCreating] = useState(false);
  const [newRoleName, setNewRoleName] = useState("");
  const [newRolePermissions, setNewRolePermissions] = useState<string[]>([]);
  const [roleToDelete, setRoleToDelete] = useState<AdminRole | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  // A-137: one mis-click used to write a role's permissions through
  // immediately — instantly revoking a capability for every admin holding
  // that role, platform-wide, with no confirm and no undo. Edits now
  // accumulate here, keyed by role slug, and only take effect once the
  // operator explicitly saves; `role.permissions` itself stays the
  // source of truth until then.
  const [pendingByRole, setPendingByRole] = useState<Record<string, string[]>>({});

  const roles = data?.roles ?? [];
  const pendingRoleSlugs = Object.keys(pendingByRole);
  const hasPendingChanges = pendingRoleSlugs.length > 0;

  const displayedPermissions = (role: AdminRole) => pendingByRole[role.slug] ?? role.permissions;

  const togglePermission = (role: AdminRole, permissionValue: string, checked: boolean) => {
    const current = displayedPermissions(role);
    const next = checked
      ? [...current, permissionValue]
      : current.filter((permission) => permission !== permissionValue);

    setPendingByRole((state) => {
      const { [role.slug]: _discard, ...rest } = state;
      const unchanged =
        next.length === role.permissions.length &&
        next.every((permission) => role.permissions.includes(permission));
      return unchanged ? rest : { ...rest, [role.slug]: next };
    });
  };

  const discardPendingChanges = () => setPendingByRole({});

  const saveAllPendingChanges = async () => {
    setIsSaving(true);
    // Tracked by slug, not name: a role staged for a change can be deleted
    // out from under this form by another admin/tab before Save runs, and
    // a slug is the one identifier still meaningful once the role itself
    // is gone — matching failures back to pending state by name silently
    // dropped exactly that edit while still reporting success.
    const failedSlugs: string[] = [];
    try {
      for (const slug of pendingRoleSlugs) {
        const role = roles.find((r) => r.slug === slug);
        if (!role) {
          failedSlugs.push(slug);
          continue;
        }
        try {
          await updatePermissionsMutation.mutateAsync({
            slug,
            permissions: pendingByRole[slug],
          });
        } catch (_error) {
          failedSlugs.push(slug);
        }
      }

      if (failedSlugs.length === 0) {
        toast.success("Permission changes saved");
        setPendingByRole({});
      } else {
        const failedNames = failedSlugs.map(
          (slug) => roles.find((r) => r.slug === slug)?.name ?? `${slug} (role no longer exists)`,
        );
        toast.error(`Failed to save: ${failedNames.join(", ")}`);
        // Drop only the roles that saved successfully; leave the failed
        // ones pending so the operator doesn't lose the edit.
        setPendingByRole((state) =>
          Object.fromEntries(Object.entries(state).filter(([slug]) => failedSlugs.includes(slug))),
        );
      }
    } finally {
      setIsSaving(false);
    }
  };

  const toggleNewRolePermission = (permissionValue: string, checked: boolean) => {
    setNewRolePermissions((current) =>
      checked
        ? [...current, permissionValue]
        : current.filter((permission) => permission !== permissionValue),
    );
  };

  const resetNewRoleForm = () => {
    setIsCreating(false);
    setNewRoleName("");
    setNewRolePermissions([]);
  };

  const handleCreateRole = async () => {
    if (!newRoleName.trim()) {
      toast.error("Enter a name for the new role");
      return;
    }

    try {
      await createRoleMutation.mutateAsync({
        name: newRoleName.trim(),
        permissions: newRolePermissions,
      });
      toast.success(`Role "${newRoleName.trim()}" created`);
      resetNewRoleForm();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to create role");
    }
  };

  const handleDeleteRole = async () => {
    if (!roleToDelete) return;

    try {
      await deleteRoleMutation.mutateAsync(roleToDelete.slug);
      toast.success(`Role "${roleToDelete.name}" deleted`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to delete role");
    } finally {
      setRoleToDelete(null);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-12">
        <Loader2 className="h-8 w-8 animate-spin text-indigo-500" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Card className="bg-white dark:bg-slate-900 border-accent/20">
        <CardHeader className="flex flex-row items-center justify-between gap-4">
          <div>
            <CardTitle className="flex items-center gap-2">
              <ShieldCheck className="h-5 w-5 text-indigo-500" />
              Admin Permissions
            </CardTitle>
            <CardDescription>
              Control which platform permissions each admin role is delegated.
            </CardDescription>
          </div>
          <Button
            variant="outline"
            onClick={() => (isCreating ? resetNewRoleForm() : setIsCreating(true))}
          >
            <Plus className="w-4 h-4 mr-2" />
            New Role
          </Button>
        </CardHeader>
        <CardContent className="space-y-6">
          {isCreating && (
            <div className="space-y-4 p-4 border rounded-lg bg-slate-50 dark:bg-slate-800/50">
              <div className="space-y-2 max-w-sm">
                <Label htmlFor="new-role-name">Role Name</Label>
                <Input
                  id="new-role-name"
                  value={newRoleName}
                  onChange={(event) => setNewRoleName(event.target.value)}
                  placeholder="e.g. Support Agent"
                />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {PLATFORM_PERMISSION_OPTIONS.map((permission) => (
                  <label
                    key={permission.value}
                    className="flex items-center gap-2 text-sm"
                    htmlFor={`new-role-${permission.value}`}
                  >
                    <Checkbox
                      id={`new-role-${permission.value}`}
                      checked={newRolePermissions.includes(permission.value)}
                      onCheckedChange={(checked) =>
                        toggleNewRolePermission(permission.value, checked === true)
                      }
                    />
                    {permission.label}
                  </label>
                ))}
              </div>
              <div className="flex gap-2 justify-end">
                <Button variant="ghost" onClick={resetNewRoleForm}>
                  Cancel
                </Button>
                <Button
                  onClick={() => void handleCreateRole()}
                  disabled={createRoleMutation.isPending}
                >
                  {createRoleMutation.isPending ? (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  ) : null}
                  Create Role
                </Button>
              </div>
            </div>
          )}

          {hasPendingChanges && (
            <div className="flex items-center justify-between gap-4 p-4 rounded-lg border border-amber-300 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/40">
              <p className="text-sm font-medium text-amber-800 dark:text-amber-200">
                Unsaved permission changes for{" "}
                {pendingRoleSlugs
                  .map((slug) => roles.find((role) => role.slug === slug)?.name ?? slug)
                  .join(", ")}
                . Nothing takes effect until you save.
              </p>
              <div className="flex gap-2 shrink-0">
                <Button variant="ghost" onClick={discardPendingChanges} disabled={isSaving}>
                  <Undo2 className="w-4 h-4 mr-2" />
                  Discard
                </Button>
                <Button onClick={() => void saveAllPendingChanges()} disabled={isSaving}>
                  {isSaving ? (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  ) : (
                    <Save className="w-4 h-4 mr-2" />
                  )}
                  Save changes
                </Button>
              </div>
            </div>
          )}

          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Permission</TableHead>
                {roles.map((role) => (
                  <TableHead key={role.id}>
                    <div className="flex items-center justify-between gap-2">
                      <span>
                        {role.name}
                        {pendingByRole[role.slug] && (
                          <span className="ml-1.5 text-amber-600 dark:text-amber-400" title="Unsaved changes">
                            •
                          </span>
                        )}
                      </span>
                      {!role.is_system && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          aria-label={`Delete ${role.name}`}
                          disabled={role.user_count > 0}
                          title={
                            role.user_count > 0
                              ? `Reassign the ${role.user_count} admin(s) on this role before deleting it`
                              : undefined
                          }
                          onClick={() => setRoleToDelete(role)}
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      )}
                    </div>
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {PLATFORM_PERMISSION_OPTIONS.map((permission) => (
                <TableRow key={permission.value}>
                  <TableCell>
                    <div className="font-medium">{permission.label}</div>
                    <div className="text-xs text-muted-foreground">
                      {permission.description}
                    </div>
                  </TableCell>
                  {roles.map((role) => (
                    <TableCell key={role.id}>
                      <Checkbox
                        aria-label={`${permission.label} for ${role.name}`}
                        checked={displayedPermissions(role).includes(permission.value)}
                        disabled={isSaving}
                        className={pendingByRole[role.slug] ? "border-amber-500" : undefined}
                        onCheckedChange={(checked) =>
                          togglePermission(role, permission.value, checked === true)
                        }
                      />
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <ConfirmDialog
        open={roleToDelete !== null}
        onOpenChange={(open) => !open && setRoleToDelete(null)}
        title={`Delete role "${roleToDelete?.name}"?`}
        description={
          roleToDelete && roleToDelete.user_count > 0
            ? `${roleToDelete.user_count} admin(s) still hold the "${roleToDelete.name}" role and must be reassigned before it can be deleted.`
            : `This permanently removes the "${roleToDelete?.name}" role. No admin currently holds it.`
        }
        confirmLabel="Delete role"
        variant="destructive"
        onConfirm={() => void handleDeleteRole()}
      />
    </div>
  );
}
