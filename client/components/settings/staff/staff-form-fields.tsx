import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  InputOTP,
  InputOTPGroup,
  InputOTPSlot,
} from "@/components/ui/input-otp";
import { HelpCircle } from "lucide-react";
import { usePermissionGroups } from "@/lib/hooks/use-permission-groups";
import type { StoreProfile } from "@/lib/context/store-context";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

export interface StaffFormData {
  first_name: string;
  last_name: string;
  username: string;
  email: string;
  pin: string;
  role: string;
  store_id: string;
  permission_group_id?: string;
}

interface StaffFormFieldsProps {
  formId: string;
  onSubmit: (e: React.FormEvent) => void;
  formData: StaffFormData;
  setFormData: React.Dispatch<React.SetStateAction<StaffFormData>>;
  isEditing: boolean;
  availableStores: StoreProfile[];
}

/** The staff form's actual input fields, split out from StaffFormDialog so
 * the dialog wrapper (state, submit handling, footer buttons) stays focused
 * on orchestration rather than markup. */
export function StaffFormFields({
  formId,
  onSubmit,
  formData,
  setFormData,
  isEditing,
  availableStores,
}: StaffFormFieldsProps) {
  const { groups } = usePermissionGroups();

  return (
    <form id={formId} onSubmit={onSubmit} className="space-y-4 py-4 my-0.5">
      <div className="grid grid-cols-2 gap-4">
        <div className="grid gap-2">
          <Label htmlFor="first_name">First Name *</Label>
          <Input
            id="first_name"
            placeholder="e.g. John"
            value={formData.first_name}
            onChange={(e) =>
              setFormData((prev) => ({
                ...prev,
                first_name: e.target.value,
              }))
            }
            required
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="last_name">Last Name *</Label>
          <Input
            id="last_name"
            placeholder="e.g. Doe"
            value={formData.last_name}
            onChange={(e) =>
              setFormData((prev) => ({
                ...prev,
                last_name: e.target.value,
              }))
            }
            required
          />
        </div>
      </div>
      {/* <div className="grid grid-cols-2 gap-4"> */}
      <div className="grid gap-2">
        <Label htmlFor="username">Username *</Label>
        <Input
          id="username"
          placeholder="johndoe"
          value={formData.username}
          onChange={(e) =>
            setFormData((prev) => ({
              ...prev,
              username: e.target.value.toLowerCase(),
            }))
          }
          required
        />
      </div>

      <div className="grid gap-2">
        <Label htmlFor="pin">
          {!!isEditing && "New Login PIN"}
          {!isEditing && "Login PIN *"}
        </Label>
        <div className="flex justify-start">
          <InputOTP
            maxLength={4}
            value={formData.pin}
            onChange={(value) =>
              setFormData((prev) => ({
                ...prev,
                pin: value.replace(/\D/g, ""),
              }))
            }
            className="md:input-mode-numeric"
            autoComplete="off"
          >
            <InputOTPGroup>
              <InputOTPSlot index={0} />
              <InputOTPSlot index={1} />
              <InputOTPSlot index={2} />
              <InputOTPSlot index={3} />
            </InputOTPGroup>
          </InputOTP>
        </div>
        {isEditing && (
          <p className="text-[10px] text-muted-foreground mt-1">
            Leave blank to keep existing PIN
          </p>
        )}
      </div>
      {/* </div> */}

      <div className="grid gap-2">
        <Label htmlFor="email">Email (Optional)</Label>
        <Input
          id="email"
          type="email"
          placeholder="john@example.com"
          value={formData.email}
          onChange={(e) =>
            setFormData((prev) => ({ ...prev, email: e.target.value }))
          }
        />
      </div>
      <div className="grid gap-2">
        <div className="flex items-center gap-2">
          <Label htmlFor="role">Group *</Label>
          <TooltipProvider delayDuration={0}>
            <Tooltip>
              <TooltipTrigger asChild>
                <HelpCircle className="h-4 w-4 text-muted-foreground hover:text-foreground cursor-help" />
              </TooltipTrigger>
              <TooltipContent className="max-w-xs">
                <p>
                  The Group decides exactly what this staff member can do. The
                  built-in groups (Admin, Manager, Specialist, Sales Staff,
                  Auditor) match how those roles have always worked. To change
                  what a group can do, or to build your own, go to Settings →
                  Staff → Roles &amp; Permissions.
                </p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
        <Select
          value={formData.permission_group_id ?? ""}
          onValueChange={(groupId) => {
            const group = groups.find((g) => g.id === groupId);
            setFormData((prev) => ({
              ...prev,
              permission_group_id: groupId,
              role: group?.based_on_role ?? prev.role,
            }));
          }}
        >
          <SelectTrigger>
            <SelectValue placeholder="Select group" />
          </SelectTrigger>
          <SelectContent>
            {groups.map((g) => (
              <SelectItem key={g.id} value={g.id}>
                {g.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      {availableStores && availableStores.length > 1 && (
        <div className="grid gap-2">
          <Label htmlFor="store_id">Assigned Store</Label>
          <Select
            value={formData.store_id}
            onValueChange={(val) =>
              setFormData((prev) => ({ ...prev, store_id: val }))
            }
          >
            <SelectTrigger>
              <SelectValue placeholder="Select store" />
            </SelectTrigger>
            <SelectContent>
              {availableStores.map((store) => (
                <SelectItem key={store.id} value={store.id}>
                  {store.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}
    </form>
  );
}
