import {
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, User, Mail, Lock, Store } from "lucide-react";
import type { DashboardStore } from "@/lib/types/dashboard";
import type { StaffFormData } from "@/lib/utils/staff-form";

const ROLE_OPTIONS = [
  { value: "admin", label: "Admin (Local Master)" },
  { value: "manager", label: "Manager (Admin)" },
  { value: "specialist", label: "Specialist (Sub-account)" },
  { value: "sales_staff", label: "Sales Staff / Cashier" },
  { value: "auditor", label: "Auditor (Read-only)" },
];

interface StaffModalFieldsProps {
  formData: StaffFormData;
  setFormData: (data: StaffFormData) => void;
  stores: DashboardStore[];
  isEditing: boolean;
  loading: boolean;
  onClose: () => void;
}

export function StaffModalFields({
  formData,
  setFormData,
  stores,
  isEditing,
  loading,
  onClose,
}: StaffModalFieldsProps) {
  return (
    <>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label
            htmlFor="first_name"
            className="text-xs font-bold uppercase tracking-wider opacity-60"
          >
            First Name
          </Label>
          <div className="relative">
            <User className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
            <Input
              id="first_name"
              className="pl-10 font-bold"
              placeholder="John"
              value={formData.first_name}
              onChange={(e) =>
                setFormData({ ...formData, first_name: e.target.value })
              }
              required
            />
          </div>
        </div>
        <div className="space-y-2">
          <Label
            htmlFor="last_name"
            className="text-xs font-bold uppercase tracking-wider opacity-60"
          >
            Last Name
          </Label>
          <div className="relative">
            <User className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
            <Input
              id="last_name"
              className="pl-10 font-bold"
              placeholder="Doe"
              value={formData.last_name}
              onChange={(e) =>
                setFormData({ ...formData, last_name: e.target.value })
              }
              required
            />
          </div>
        </div>
      </div>

      <div className="space-y-2">
        <Label
          htmlFor="email"
          className="text-xs font-bold uppercase tracking-wider opacity-60"
        >
          Email Address (Cloud Login) -{" "}
          <span className="text-primary italic lowercase">
            Optional for local staff
          </span>
        </Label>
        <div className="relative">
          <Mail className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
          <Input
            id="email"
            type="email"
            className="pl-10 font-medium"
            placeholder="staff@dumosrx.com"
            value={formData.email}
            onChange={(e) =>
              setFormData({ ...formData, email: e.target.value })
            }
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label
            htmlFor="username"
            className="text-xs font-bold uppercase tracking-wider opacity-60"
          >
            Local Username
          </Label>
          <Input
            id="username"
            className="font-black text-primary"
            placeholder="jdoe"
            value={formData.username}
            onChange={(e) =>
              setFormData({ ...formData, username: e.target.value })
            }
            required
          />
        </div>
        <div className="space-y-2">
          <Label
            htmlFor="pin"
            className="text-xs font-bold uppercase tracking-wider opacity-60"
          >
            Local PIN
          </Label>
          <Input
            id="pin"
            type="password"
            maxLength={4}
            className="font-black text-center tracking-widest"
            placeholder="1234"
            value={formData.pin}
            onChange={(e) => setFormData({ ...formData, pin: e.target.value })}
            required
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 border-t pt-4 border-muted/50">
        <div className="space-y-2">
          <Label
            htmlFor="role"
            className="text-xs font-bold uppercase tracking-wider opacity-60"
          >
            Staff Role
          </Label>
          <select
            id="role"
            className="w-full bg-background border border-input h-10 px-3 rounded-md text-sm font-bold focus:ring-2 focus:ring-primary outline-none"
            value={formData.role}
            onChange={(e) => setFormData({ ...formData, role: e.target.value })}
          >
            {ROLE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-2">
          <Label
            htmlFor="store_id"
            className="text-xs font-bold uppercase tracking-wider opacity-60"
          >
            Assign to Shop
          </Label>
          <div className="relative">
            <Store className="absolute left-3 top-3 h-4 w-4 text-muted-foreground z-10" />
            <select
              id="store_id"
              className="w-full bg-background border border-input h-10 pl-10 pr-3 rounded-md text-sm font-bold focus:ring-2 focus:ring-primary outline-none relative"
              value={formData.store_id}
              onChange={(e) =>
                setFormData({ ...formData, store_id: e.target.value })
              }
              required
            >
              {stores.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      <div className="space-y-2">
        <Label
          htmlFor="password"
          title="Optional for local staff"
          className="text-xs font-bold uppercase tracking-wider opacity-60"
        >
          Cloud Password -{" "}
          <span className="text-primary italic lowercase">
            Optional for local staff
          </span>
        </Label>
        <div className="relative">
          <Lock className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
          <Input
            id="password"
            type="password"
            className="pl-10 font-medium"
            placeholder={
              isEditing
                ? "••••••••"
                : "Leave blank to use local credentials only"
            }
            value={formData.password}
            onChange={(e) =>
              setFormData({ ...formData, password: e.target.value })
            }
          />
        </div>
      </div>

      <DialogFooter className="pt-6 border-t border-muted/50">
        <Button
          type="button"
          variant="ghost"
          onClick={onClose}
          disabled={loading}
          className="font-bold"
        >
          Cancel
        </Button>
        <Button
          type="submit"
          className="font-black min-w-35"
          disabled={loading}
        >
          {loading ? (
            <Loader2 className="h-4 w-4 animate-spin mr-2" />
          ) : isEditing ? (
            "Update Staff"
          ) : (
            "Create Account"
          )}
        </Button>
      </DialogFooter>
    </>
  );
}
