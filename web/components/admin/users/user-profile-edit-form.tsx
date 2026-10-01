import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { usePlatformRoleOptions } from "@/hooks/use-platform-role-options";
import type { AdminUser, AdminUserProfileUpdate } from "@/lib/types/admin";
import {
  buildUserProfileUpdate,
  toEditValues,
  validateUserProfileEdit,
  type UserProfileEditErrors,
  type UserProfileEditValues,
} from "./user-profile-edit-validation";

interface UserProfileEditFormProps {
  user: AdminUser;
  onCancel: () => void;
  onSave: (payload: AdminUserProfileUpdate) => void;
  isPending: boolean;
}

const FIELD_CLASS =
  "bg-slate-50 dark:bg-slate-800/50 border-slate-200 dark:border-slate-800 rounded-2xl h-12 font-bold";
const LABEL_CLASS =
  "text-slate-600 dark:text-slate-400 font-bold uppercase text-[10px] tracking-widest";

const TEXT_FIELDS: { key: keyof UserProfileEditValues; label: string; type?: string }[] = [
  { key: "first_name", label: "First Name" },
  { key: "last_name", label: "Last Name" },
  { key: "phone", label: "Phone" },
  { key: "email", label: "Email", type: "email" },
];

export function UserProfileEditForm({
  user,
  onCancel,
  onSave,
  isPending,
}: UserProfileEditFormProps) {
  const roleOptions = usePlatformRoleOptions();
  const allowedRoleSlugs = useMemo(
    () => roleOptions.map((option) => option.value),
    [roleOptions],
  );
  const [values, setValues] = useState<UserProfileEditValues>(() => toEditValues(user));
  const [errors, setErrors] = useState<UserProfileEditErrors>({});
  const [roleEdited, setRoleEdited] = useState(false);

  // The custom roles arrive asynchronously, so until the operator picks a
  // role themselves the field must re-resolve from the loaded list.
  const resolvedValues = roleEdited
    ? values
    : { ...values, role: toEditValues(user, allowedRoleSlugs).role };

  const setField = (key: keyof UserProfileEditValues, value: string) => {
    if (key === "role") setRoleEdited(true);
    setValues((current) => ({ ...current, [key]: value }));
  };

  const handleSubmit = () => {
    const found = validateUserProfileEdit(resolvedValues, allowedRoleSlugs);
    setErrors(found);
    if (Object.keys(found).length > 0) return;
    onSave(buildUserProfileUpdate(user, resolvedValues, allowedRoleSlugs));
  };

  return (
    <div className="p-8 space-y-5">
      <div className="grid grid-cols-2 gap-5">
        {TEXT_FIELDS.map((field) => (
          <div key={field.key} className="space-y-2">
            <Label htmlFor={`profile-${field.key}`} className={LABEL_CLASS}>
              {field.label}
            </Label>
            <Input
              id={`profile-${field.key}`}
              type={field.type ?? "text"}
              className={FIELD_CLASS}
              value={resolvedValues[field.key]}
              onChange={(e) => setField(field.key, e.target.value)}
            />
            {errors[field.key] ? (
              <p className="text-xs font-semibold text-rose-500">{errors[field.key]}</p>
            ) : null}
          </div>
        ))}
        <div className="space-y-2 col-span-2">
          <Label htmlFor="profile-role" className={LABEL_CLASS}>
            Role
          </Label>
          <Select
            value={resolvedValues.role}
            onValueChange={(value) => setField("role", value)}
          >
            <SelectTrigger id="profile-role" className={`${FIELD_CLASS} w-full`}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {roleOptions.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  <div>
                    <div className="font-semibold">{opt.label}</div>
                    <div className="text-xs text-muted-foreground">{opt.description}</div>
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {errors.role ? (
            <p className="text-xs font-semibold text-rose-500">{errors.role}</p>
          ) : null}
        </div>
      </div>
      <p className="text-xs text-muted-foreground">
        Password, account status and subscription plan are changed from their own actions in the
        user menu, not here.
      </p>
      <div className="flex justify-end gap-3">
        <Button variant="outline" className="rounded-xl font-bold" onClick={onCancel}>
          Cancel
        </Button>
        <Button className="rounded-xl font-bold px-8" onClick={handleSubmit} disabled={isPending}>
          {isPending ? "Saving..." : "Save Changes"}
        </Button>
      </div>
    </div>
  );
}
