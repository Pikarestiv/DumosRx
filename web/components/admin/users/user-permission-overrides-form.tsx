import { useState } from "react";
import { ShieldCheck, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useUpdateUserPermissionOverridesMutation } from "@/lib/api/admin-hooks-roles";
import { PLATFORM_PERMISSION_OPTIONS } from "@/lib/constants/platform-permissions";
import type { AdminUser } from "@/lib/types/admin";

export type PermissionOverrideState = "inherited" | "granted" | "revoked";

const OVERRIDE_TO_VALUE: Record<PermissionOverrideState, boolean | null> = {
  inherited: null,
  granted: true,
  revoked: false,
};

function initialOverrideState(user: AdminUser, permissionValue: string): PermissionOverrideState {
  return user.effective_permissions?.includes(permissionValue) ? "granted" : "inherited";
}

interface UserPermissionOverridesFormProps {
  user: AdminUser;
  onCancel?: () => void;
  onSaved?: () => void;
}

export function UserPermissionOverridesForm({
  user,
  onCancel,
  onSaved,
}: UserPermissionOverridesFormProps) {
  const updateOverridesMutation = useUpdateUserPermissionOverridesMutation();
  const [overrides, setOverrides] = useState<Record<string, PermissionOverrideState>>(() =>
    Object.fromEntries(
      PLATFORM_PERMISSION_OPTIONS.map((permission) => [
        permission.value,
        initialOverrideState(user, permission.value),
      ]),
    ),
  );
  const [touchedPermissions, setTouchedPermissions] = useState<Set<string>>(new Set());

  const setOverride = (permissionValue: string, state: PermissionOverrideState) => {
    setOverrides((current) => ({ ...current, [permissionValue]: state }));
    setTouchedPermissions((current) => new Set(current).add(permissionValue));
  };

  const handleSave = async () => {
    if (touchedPermissions.size === 0) {
      onSaved?.();
      return;
    }

    const payload = Object.fromEntries(
      [...touchedPermissions].map((permissionValue) => [
        permissionValue,
        OVERRIDE_TO_VALUE[overrides[permissionValue]],
      ]),
    );

    await updateOverridesMutation.mutateAsync({ id: user.id, overrides: payload });
    setTouchedPermissions(new Set());
    onSaved?.();
  };

  return (
    <div className="p-8 space-y-5">
      <div className="flex items-center gap-2 text-slate-500">
        <ShieldCheck className="h-4 w-4" />
        <p className="text-[10px] uppercase font-bold tracking-widest opacity-70">
          Individual Permission Overrides
        </p>
      </div>
      <Alert>
        <TriangleAlert />
        <AlertDescription>
          &quot;Granted&quot; below reflects this admin&apos;s actual effective permissions. An
          explicit revoke can&apos;t yet be told apart from a role that never granted the
          permission in the first place — both show as &quot;Inherited&quot; until the server
          exposes the raw override rows. Only the changes you make in this session are sent when
          you save — untouched rows are left alone.
        </AlertDescription>
      </Alert>
      <div className="space-y-4">
        {PLATFORM_PERMISSION_OPTIONS.map((permission) => (
          <div
            key={permission.value}
            className="flex items-center justify-between gap-4 p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-800"
          >
            <div>
              <p className="text-sm font-bold text-slate-900 dark:text-white">
                {permission.label}
              </p>
              <p className="text-xs text-muted-foreground">{permission.description}</p>
            </div>
            <Select
              value={overrides[permission.value]}
              onValueChange={(value) =>
                setOverride(permission.value, value as PermissionOverrideState)
              }
            >
              <SelectTrigger
                aria-label={`${permission.label} override`}
                className="w-40 rounded-xl font-bold"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="inherited">Inherited</SelectItem>
                <SelectItem value="granted">Granted</SelectItem>
                <SelectItem value="revoked">Revoked</SelectItem>
              </SelectContent>
            </Select>
          </div>
        ))}
      </div>
      <div className="flex justify-end gap-3">
        {onCancel ? (
          <Button variant="outline" className="rounded-xl font-bold" onClick={onCancel}>
            Cancel
          </Button>
        ) : null}
        <Button
          className="rounded-xl font-bold px-8"
          onClick={() => void handleSave()}
          disabled={updateOverridesMutation.isPending}
        >
          {updateOverridesMutation.isPending ? "Saving..." : "Save Changes"}
        </Button>
      </div>
    </div>
  );
}
