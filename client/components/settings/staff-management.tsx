"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { UserPlus } from "lucide-react";
import { useUsers } from "@/lib/hooks/queries/use-users";
import { useFeatureGate } from "@/lib/hooks/use-feature-gate";
import { useStore } from "@/lib/context/store-context";
import type { StaffListItem } from "@/lib/types/user";

import { StaffList } from "./staff/staff-list";
import { StaffFormDialog } from "./staff/staff-form-dialog";
import { StaffDeleteDialog } from "./staff/staff-delete-dialog";

export function StaffManagement() {
  const { activeStoreId, availableStores } = useStore();
  const { maxStaffAccounts, getUpgradeMessage , withRestriction } = useFeatureGate();
  const [selectedStore, setSelectedStore] = useState<string>("all");

  const filterStoreId = selectedStore === "all" ? null : selectedStore;
  const { data: users = [], isLoading, refetch: loadUsers } = useUsers(
    availableStores && availableStores.length > 1 ? filterStoreId : activeStoreId,
  );

  // Dialog States
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [userToEdit, setUserToEdit] = useState<StaffListItem | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null);

  const handleOpenCreate = () => {
    setUserToEdit(null);
    setIsFormOpen(true);
  };

  const handleOpenEdit = (user: StaffListItem) => {
    setUserToEdit(user);
    setIsFormOpen(true);
  };

  const handleDeleteInitiate = (id: string, name: string) => {
    setDeleteTarget({ id, name });
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold font-serif">Staff Management</h2>
          <p className="text-sm text-muted-foreground">
            Create and manage sub-accounts for your team members.
            {users.length >= maxStaffAccounts && (
              <span className="block mt-1 text-amber-600 font-medium">
                You have reached your limit of {maxStaffAccounts} staff accounts on your current plan. {getUpgradeMessage('staff', "Upgrade your plan to add more.")}
              </span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-3">
          {availableStores && availableStores.length > 1 && (
            <select
              className="bg-background border border-input px-3 py-2 rounded-lg text-sm font-medium h-10"
              value={selectedStore}
              onChange={(e) => setSelectedStore(e.target.value)}
            >
              <option value="all">All Stores</option>
              {availableStores.map((store) => (
                <option key={store.id} value={store.id}>
                  {store.name}
                </option>
              ))}
            </select>
          )}
          <Button
            className="bg-primary hover:bg-primary/90"
            disabled={users.length >= maxStaffAccounts}
            onClick={withRestriction(handleOpenCreate)}
          >
            <UserPlus className="w-4 h-4 mr-2" />
            Add Staff Member
          </Button>
        </div>
      </div>

      <Card>
        <CardContent className="p-0">
          <StaffList 
            users={users} 
            isLoading={isLoading} 
            onEdit={handleOpenEdit} 
            onDelete={handleDeleteInitiate} 
          />
        </CardContent>
      </Card>

      <StaffFormDialog
        isOpen={isFormOpen}
        onOpenChange={setIsFormOpen}
        userToEdit={userToEdit}
        activeStoreId={activeStoreId}
        onSuccess={loadUsers}
      />

      <StaffDeleteDialog
        target={deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onSuccess={loadUsers}
      />
    </div>
  );
}
