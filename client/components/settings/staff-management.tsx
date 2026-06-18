"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { UserPlus } from "lucide-react";
import { getUsers } from "@/lib/db/local-database";
import { toast } from "sonner";
import { useFeatureGate } from "@/lib/hooks/use-feature-gate";
import { useStore } from "@/lib/context/store-context";

import { StaffList } from "./staff/staff-list";
import { StaffFormDialog } from "./staff/staff-form-dialog";
import { StaffDeleteDialog } from "./staff/staff-delete-dialog";

export function StaffManagement() {
  const { activeStoreId } = useStore();
  const { maxStaffAccounts, getUpgradeMessage } = useFeatureGate();
  
  const [users, setUsers] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  
  // Dialog States
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [userToEdit, setUserToEdit] = useState<any | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null);

  const loadUsers = async () => {
    setIsLoading(true);
    try {
      const data = await getUsers(activeStoreId);
      setUsers(data);
    } catch (error) {
      console.error("Failed to load users:", error);
      toast.error("Failed to load staff list");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadUsers();
  }, [activeStoreId]);

  const handleOpenCreate = () => {
    setUserToEdit(null);
    setIsFormOpen(true);
  };

  const handleOpenEdit = (user: any) => {
    setUserToEdit(user);
    setIsFormOpen(true);
  };

  const handleDeleteInitiate = (id: string, name: string) => {
    setDeleteTarget({ id, name });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
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
        <Button 
          className="bg-primary hover:bg-primary/90"
          disabled={users.length >= maxStaffAccounts}
          onClick={handleOpenCreate}
        >
          <UserPlus className="w-4 h-4 mr-2" />
          Add Staff Member
        </Button>
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
