"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { UserPlus } from "lucide-react";
import { toast } from "sonner";
import { useUsers, useMutateUser } from "@/lib/hooks/queries/use-users";
import { useFeatureGate } from "@/lib/hooks/use-feature-gate";
import { useStore } from "@/lib/context/store-context";
import { queryKeys } from "@/lib/query-keys";
import { getStaffCount } from "@/lib/db/queries/auth";
import type { StaffListItem } from "@/lib/types/user";
import { buildStaffCsv } from "@/lib/utils/export-staff-csv";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";

import { StaffList } from "./staff/staff-list";
import { StaffFormDialog } from "./staff/staff-form-dialog";
import { StaffDeleteDialog } from "./staff/staff-delete-dialog";
import { StaffStats } from "./staff/staff-stats";
import { StaffActivitiesTab } from "./staff/staff-activities-tab";

export function StaffManagement() {
  const { activeStoreId, availableStores } = useStore();
  const { maxStaffAccounts, getUpgradeMessage , withRestriction } = useFeatureGate();
  const [selectedStore, setSelectedStore] = useState<string>("all");

  const filterStoreId = selectedStore === "all" ? null : selectedStore;
  const { data: users = [], isLoading, refetch: loadUsers } = useUsers(
    availableStores && availableStores.length > 1 ? filterStoreId : activeStoreId,
  );
  const { update } = useMutateUser();

  // Seat-limit cap and the "Total Staff" stat must count every active
  // account, not just the store-filtered `users` list, so they use this
  // unfiltered, is_active-only count instead of users.length.
  const { data: staffCount = 0 } = useQuery({
    ...queryKeys.staff.count(),
    queryFn: () => getStaffCount(),
  });

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

  const handleReactivate = async (id: string) => {
    try {
      await update.mutateAsync({ id, data: { is_active: 1 } });
      toast.success("Staff account reactivated");
      loadUsers();
    } catch (error) {
      console.error("Failed to reactivate user:", error);
      toast.error("Failed to reactivate staff account");
    }
  };

  const handleExport = () => {
    const csv = buildStaffCsv(users);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `staff-list-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <Tabs defaultValue="management" className="space-y-6">
      <TabsList className="w-full md:w-max">
        <TabsTrigger value="management">Management</TabsTrigger>
        <TabsTrigger value="activities">Activities</TabsTrigger>
      </TabsList>

      <TabsContent value="management" className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h2 className="text-xl font-bold font-serif">Staff Management</h2>
            <p className="text-sm text-muted-foreground">
              Create and manage sub-accounts for your team members.
              {staffCount >= maxStaffAccounts && (
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
            <Button variant="outline" onClick={handleExport} disabled={users.length === 0}>
              Export Staff List
            </Button>
            <Button
              className="bg-primary hover:bg-primary/90"
              disabled={staffCount >= maxStaffAccounts}
              onClick={withRestriction(handleOpenCreate)}
            >
              <UserPlus className="w-4 h-4 mr-2" />
              Add Staff Member
            </Button>
          </div>
        </div>

        <StaffStats users={users} totalStaffCount={staffCount} maxStaffAccounts={maxStaffAccounts} />

        <Card>
          <CardContent className="p-0">
            <StaffList
              users={users}
              isLoading={isLoading}
              onEdit={handleOpenEdit}
              onDelete={handleDeleteInitiate}
              onReactivate={handleReactivate}
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
      </TabsContent>

      <TabsContent value="activities">
        <StaffActivitiesTab />
      </TabsContent>
    </Tabs>
  );
}
