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
import { Info } from "lucide-react";
import { STAFF_ROLES } from "@/lib/constants/roles";
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
          <Label htmlFor="role">System Role</Label>
          <TooltipProvider delayDuration={0}>
            <Tooltip>
              <TooltipTrigger asChild>
                <Info className="h-4 w-4 text-muted-foreground hover:text-foreground cursor-help" />
              </TooltipTrigger>
              <TooltipContent>
                <p>
                  Determines what the staff member can access. Cashiers can only
                  make sales, Managers can view stock batches, and Admins have
                  full access.
                </p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
        <Select
          value={formData.role}
          onValueChange={(val) =>
            setFormData((prev) => ({ ...prev, role: val }))
          }
        >
          <SelectTrigger>
            <SelectValue placeholder="Select role" />
          </SelectTrigger>
          <SelectContent>
            {STAFF_ROLES.map((r) => (
              <SelectItem key={r.value} value={r.value}>
                {r.label}
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
