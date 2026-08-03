"use client";

import { useState, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { StaffModal } from "../staff-modal";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { toast } from "sonner";
import {
  useStaff,
  useDeleteStaffMutation,
  useUpdateStaffMutation,
  useSubscriptionStatus,
} from "@/lib/api/hooks";
import { StaffStats } from "./staff-stats";
import { StaffTable } from "./staff-table";
import type { StaffMember, DashboardStore } from "@/lib/types/dashboard";

interface StaffViewProps {
  staff: StaffMember[];
  stores: DashboardStore[];
  hideHeader?: boolean;
}

export function StaffView({ staff, stores, hideHeader }: StaffViewProps) {
  const searchParams = useSearchParams();
  const storeIdParam = searchParams.get("store_id");

  const [selectedStore, setSelectedStore] = useState(storeIdParam || "all");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingStaff, setEditingStaff] = useState<StaffMember | null>(null);
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);

  // Sync with URL params if they change
  useEffect(() => {
    if (storeIdParam) {
      setSelectedStore(storeIdParam);
    }
  }, [storeIdParam]);

  const { data: staffData, isLoading: _isLoading } = useStaff(selectedStore);
  const { data: subStatus } = useSubscriptionStatus();
  const deleteMutation = useDeleteStaffMutation();
  const updateMutation = useUpdateStaffMutation();

  const staffToDisplay = staffData || staff;

  const handleCreate = () => {
    setEditingStaff(null);
    setIsModalOpen(true);
  };

  const handleEdit = (s: StaffMember) => {
    setEditingStaff(s);
    setIsModalOpen(true);
  };

  const handleDelete = async (id: string) => {
    setDeleteTargetId(id);
  };

  const confirmDelete = (id: string) => {
    deleteMutation.mutate(id, {
      onSuccess: () => toast.success("Staff account deactivated"),
      onError: (err) =>
        toast.error(err.message || "Failed to deactivate staff"),
    });
    setDeleteTargetId(null);
  };

  const handleReactivate = (id: string) => {
    updateMutation.mutate(
      { id, payload: { is_active: true } },
      {
        onSuccess: () => toast.success("Staff account reactivated"),
        onError: (err) =>
          toast.error(err.message || "Failed to reactivate staff"),
      },
    );
  };

  // Filter staff based on selected store
  const filteredStaff =
    selectedStore === "all"
      ? staffToDisplay
      : staffToDisplay.filter(
          (s: StaffMember) =>
            s.store_id === selectedStore ||
            s.store_name === selectedStore,
        );

  const hasStaff = filteredStaff && filteredStaff.length > 0;

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      {!hideHeader && (
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h1 className="text-2xl sm:text-3xl font-black tracking-tight">
              Staff Management
            </h1>
            <p className="text-muted-foreground mt-1 text-sm sm:text-base">
              Monitor performance and manage accounts across your fleet
            </p>
          </div>
          <div className="flex flex-col sm:flex-row gap-3 sm:items-center w-full lg:w-auto">
            <select
              className="bg-background border border-input px-4 py-2 rounded-lg text-sm font-bold focus:ring-2 focus:ring-primary outline-none transition-all h-10 w-full sm:w-40"
              value={selectedStore}
              onChange={(e) => setSelectedStore(e.target.value)}
            >
              <option value="all">All Stores</option>
              {stores.map((store) => (
                <option key={store.id} value={store.id}>
                  {store.name}
                </option>
              ))}
            </select>
          <Button variant="outline" className="font-bold w-full sm:w-auto">
            Export Staff List
          </Button>
          <Button
            className="font-bold bg-primary hover:bg-primary/90 w-full sm:w-auto"
            onClick={handleCreate}
          >
            <UserPlus className="h-4 w-4 mr-2" />
            Add Staff Member
          </Button>
        </div>
      </div>
      )}
      <StaffStats filteredStaff={filteredStaff} subStatus={subStatus} />

      <StaffTable
        filteredStaff={filteredStaff}
        hasStaff={hasStaff}
        selectedStore={selectedStore}
        stores={stores}
        handleCreate={handleCreate}
        handleEdit={handleEdit}
        handleDelete={handleDelete}
        handleReactivate={handleReactivate}
      />

      <StaffModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSuccess={() => {}}
        stores={stores}
        staffMember={editingStaff}
      />

      <ConfirmDialog
        open={!!deleteTargetId}
        onOpenChange={(open) => {
          if (!open) setDeleteTargetId(null);
        }}
        title="Deactivate Staff Account"
        description="Are you sure you want to deactivate this staff account? They will no longer be able to log in."
        confirmLabel="Deactivate"
        onConfirm={() => deleteTargetId && confirmDelete(deleteTargetId)}
      />
    </div>
  );
}
