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
import { ShieldCheck, Trash2, Plus, Loader2 } from "lucide-react";
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
  const [pendingRoleSlug, setPendingRoleSlug] = useState<string | null>(null);

  const roles = data?.roles ?? [];

  const togglePermission = async (role: AdminRole, permissionValue: string, checked: boolean) => {
    const nextPermissions = checked
      ? [...role.permissions, permissionValue]
      : role.permissions.filter((permission) => permission !== permissionValue);

    setPendingRoleSlug(role.slug);
    try {
      await updatePermissionsMutation.mutateAsync({
        slug: role.slug,
        permissions: nextPermissions,
      });
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : `Failed to update ${role.name}'s permissions`,
      );
    } finally {
      setPendingRoleSlug(null);
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

          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Permission</TableHead>
                {roles.map((role) => (
                  <TableHead key={role.id}>
                    <div className="flex items-center justify-between gap-2">
                      <span>{role.name}</span>
                      {!role.is_system && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          aria-label={`Delete ${role.name}`}
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
                        checked={role.permissions.includes(permission.value)}
                        disabled={pendingRoleSlug === role.slug}
                        onCheckedChange={(checked) =>
                          void togglePermission(role, permission.value, checked === true)
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
        description={`This permanently removes the "${roleToDelete?.name}" role${
          roleToDelete && roleToDelete.user_count > 0
            ? ` and will leave ${roleToDelete.user_count} admin(s) without it`
            : ""
        }.`}
        confirmLabel="Delete role"
        variant="destructive"
        onConfirm={() => void handleDeleteRole()}
      />
    </div>
  );
}
