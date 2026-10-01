import { useState } from "react";
import { Shield, Store, Calendar, Activity, History, Users, Pencil } from "lucide-react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { UserProfileEditForm } from "./user-profile-edit-form";
import { useUpdateUserProfileMutation } from "@/lib/api/admin-hooks-users";
import { checkIsSuperAdmin, useAdminAuthStore } from "@/lib/store/use-admin-auth-store";
import type { AdminUserProfileUpdate } from "@/lib/types/admin";
import { StoreStaffList } from "@/components/admin/stores/store-staff-list";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { BaseDialogProps } from "./dialog-types";

export function UserProfileDialog({
  isOpen,
  onOpenChange,
  selectedUser,
}: Omit<BaseDialogProps, "setSelectedUser">) {
  const router = useRouter();
  const ownedStoreId = selectedUser?.is_store_owner ? (selectedUser.store_id ?? null) : null;
  const viewerRole = useAdminAuthStore((state) => state.user?.role);
  const canEdit = checkIsSuperAdmin(viewerRole);
  const updateMutation = useUpdateUserProfileMutation();
  const [isEditing, setIsEditing] = useState(false);

  const handleOpenChange = (open: boolean) => {
    if (!open) setIsEditing(false);
    onOpenChange(open);
  };

  const handleSave = async (payload: AdminUserProfileUpdate) => {
    if (!selectedUser) return;
    if (Object.keys(payload).length === 0) {
      setIsEditing(false);
      return;
    }

    try {
      await updateMutation.mutateAsync({ id: selectedUser.id, payload });
      toast.success("User profile updated");
      setIsEditing(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to update user profile");
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto rounded-3xl border-slate-200 dark:border-slate-800 shadow-2xl p-0">
        <DialogHeader className="sr-only">
          <DialogTitle>User Detailed Profile</DialogTitle>
          <DialogDescription>
            View detailed user profile information
          </DialogDescription>
        </DialogHeader>
        <div className="bg-indigo-600 p-8 text-white relative overflow-hidden">
          <div className="absolute top-0 right-0 p-12 opacity-10 rotate-12">
            <Shield className="h-32 w-32" />
          </div>
          <div className="relative z-10 flex items-center gap-6">
            <div className="h-20 w-20 rounded-2xl bg-white/20 backdrop-blur-md flex items-center justify-center text-3xl font-black border border-white/30">
              {selectedUser?.name?.charAt(0)}
            </div>
            <div>
              <h2 className="text-3xl font-black">{selectedUser?.name}</h2>
              <div className="flex items-center gap-2 mt-1 opacity-80 font-medium">
                <Badge className="bg-white/20 hover:bg-white/30 border-none text-white font-bold px-3">
                  {selectedUser?.role}
                </Badge>
                <span>•</span>
                <span>{selectedUser?.email}</span>
              </div>
            </div>
          </div>
        </div>
        {isEditing && selectedUser ? (
          <UserProfileEditForm
            user={selectedUser}
            onCancel={() => setIsEditing(false)}
            onSave={(payload) => void handleSave(payload)}
            isPending={updateMutation.isPending}
          />
        ) : (
          <>
          <div className="p-8 grid grid-cols-2 gap-6">
            <div className="space-y-4">
              <div className="flex items-center gap-3 text-slate-500">
                <Store className="h-4 w-4" />
                <div>
                  <p className="text-[10px] uppercase font-bold tracking-widest opacity-50">
                    Affiliated Store
                  </p>
                  <p className="text-sm font-black text-slate-900 dark:text-white">
                    {selectedUser?.store}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3 text-slate-500">
                <Calendar className="h-4 w-4" />
                <div>
                  <p className="text-[10px] uppercase font-bold tracking-widest opacity-50">
                    Member Since
                  </p>
                  <p className="text-sm font-black text-slate-900 dark:text-white">
                    {selectedUser?.joinedAt || "N/A"}
                  </p>
                </div>
              </div>
            </div>
            <div className="space-y-4">
              <div className="flex items-center gap-3 text-slate-500">
                <Activity className="h-4 w-4" />
                <div>
                  <p className="text-[10px] uppercase font-bold tracking-widest opacity-50">
                    Last Login
                  </p>
                  <p className="text-sm font-black text-slate-900 dark:text-white">
                    {selectedUser?.lastActive}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3 text-slate-500">
                <History className="h-4 w-4" />
                <div>
                  <p className="text-[10px] uppercase font-bold tracking-widest opacity-50">
                    System Status
                  </p>
                  <p
                    className={`text-sm font-black ${selectedUser?.status === "Active" ? "text-emerald-500" : "text-rose-500"}`}
                  >
                    {selectedUser?.status}
                  </p>
                </div>
              </div>
            </div>
          </div>
          {ownedStoreId ? (
            <div className="px-8 pb-8 space-y-3">
              <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-3 text-slate-500">
                  <Users className="h-4 w-4" />
                  <p className="text-[10px] uppercase font-bold tracking-widest opacity-50">
                    Staff At {selectedUser?.store}
                  </p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  className="rounded-xl font-bold"
                  onClick={() =>
                    router.push(`/admin/stores/details/?id=${encodeURIComponent(ownedStoreId)}`)
                  }
                >
                  Open Store Details
                </Button>
              </div>
              <StoreStaffList storeId={ownedStoreId} />
            </div>
          ) : null}
          <div className="p-8 border-t border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50 flex justify-end gap-3">
            {canEdit && selectedUser ? (
              <Button
                variant="outline"
                onClick={() => setIsEditing(true)}
                className="rounded-xl font-bold"
              >
                <Pencil className="h-4 w-4 mr-2" />
                Edit Profile
              </Button>
            ) : null}
            <Button
              onClick={() => handleOpenChange(false)}
              className="rounded-xl font-bold px-8"
            >
              Close Profile
            </Button>
          </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
