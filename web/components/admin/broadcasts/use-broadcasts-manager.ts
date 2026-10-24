import { useState } from "react";
import { toast } from "sonner";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { webApiClient } from "@/lib/api/client";
import { useDeleteBroadcastMutation } from "@/lib/api/admin-hooks";
import { formatDateSafe } from "@/lib/utils/date-utils";
import type { AdminBroadcast, AdminUser, BroadcastFormData } from "@/lib/types/admin";

export const broadcastStatus = (broadcast: AdminBroadcast): "live" | "inactive" | "expired" => {
  if (!broadcast.is_active) return "inactive";
  const expiry = broadcast.expires_at ? new Date(broadcast.expires_at) : null;
  if (expiry && !isNaN(expiry.getTime()) && expiry < new Date()) return "expired";
  return "live";
};

const emptyBroadcastForm = (): BroadcastFormData => ({
  title: "",
  message: "",
  type: "info",
  target_type: "all",
  user_ids: [],
  expires_at: "",
  is_active: true,
  send_email: false,
});

const broadcastToForm = (broadcast: AdminBroadcast): BroadcastFormData => ({
  title: broadcast.title,
  message: broadcast.message,
  type: broadcast.type,
  target_type: broadcast.target_type || "all",
  user_ids: broadcast.user_ids || [],
  expires_at: formatDateSafe(broadcast.expires_at, "yyyy-MM-dd", ""),
  is_active: broadcast.is_active,
  send_email: broadcast.send_email ?? false,
});

const errorMessage = (error: unknown, fallback: string) =>
  error instanceof Error ? error.message : fallback;

export function useBroadcastsManager() {
  const queryClient = useQueryClient();
  const { data: response, isLoading } = useQuery({
    queryKey: ["admin-broadcasts"],
    queryFn: () => webApiClient.adminGetBroadcasts() as Promise<AdminBroadcast[] | { data: AdminBroadcast[] }>,
  });
  const broadcasts = response
    ? Array.isArray(response)
      ? response
      : response.data
    : [];
  const deleteMutation = useDeleteBroadcastMutation();

  const [searchQuery, setSearchQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [selectedBroadcast, setSelectedBroadcast] = useState<AdminBroadcast | null>(null);
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);
  const [selectedUsers, setSelectedUsers] = useState<AdminUser[]>([]);
  const [formData, setFormData] = useState<BroadcastFormData>(emptyBroadcastForm);

  const invalidateBroadcasts = () => {
    void queryClient.invalidateQueries({ queryKey: ["admin-broadcasts"] });
    void queryClient.invalidateQueries({ queryKey: ["broadcasts"] });
  };

  const handleSelectedUsersChange = (users: AdminUser[]) => {
    setSelectedUsers(users);
    setFormData((prev) => ({ ...prev, user_ids: users.map((u) => u.id) }));
  };

  const openCreate = () => {
    setSelectedUsers([]);
    setFormData(emptyBroadcastForm());
    setIsCreateOpen(true);
  };

  const openEdit = (broadcast: AdminBroadcast) => {
    setSelectedBroadcast(broadcast);
    setSelectedUsers([]);
    setFormData(broadcastToForm(broadcast));
    setIsEditOpen(true);
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;
    setIsSubmitting(true);
    try {
      await webApiClient.createBroadcast(formData);
      toast.success("Broadcast created successfully");
      setIsCreateOpen(false);
      setSelectedUsers([]);
      setFormData(emptyBroadcastForm());
      invalidateBroadcasts();
    } catch (error) {
      toast.error(errorMessage(error, "Failed to create broadcast"));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedBroadcast || isSubmitting) return;
    setIsSubmitting(true);
    try {
      await webApiClient.updateBroadcast(selectedBroadcast.id, formData);
      toast.success("Broadcast updated successfully");
      setIsEditOpen(false);
      invalidateBroadcasts();
    } catch (error) {
      toast.error(errorMessage(error, "Failed to update broadcast"));
    } finally {
      setIsSubmitting(false);
    }
  };

  const confirmDelete = (id: string) => {
    deleteMutation.mutate(id, {
      onSuccess: () => {
        toast.success("Broadcast deleted");
        void queryClient.invalidateQueries({ queryKey: ["admin-broadcasts"] });
        setDeleteTargetId(null);
      },
      onError: (error) => {
        toast.error(errorMessage(error, "Failed to delete broadcast"));
        setDeleteTargetId(null);
      },
    });
  };

  const handleToggle = async (id: string) => {
    try {
      await webApiClient.toggleBroadcast(id);
      invalidateBroadcasts();
    } catch (error) {
      toast.error(errorMessage(error, "Failed to toggle status"));
    }
  };

  const filteredBroadcasts = (Array.isArray(broadcasts) ? broadcasts : []).filter((b) => {
    const matchesSearch =
      b.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      b.message.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesType = !typeFilter || b.type === typeFilter;
    const matchesStatus = !statusFilter || broadcastStatus(b) === statusFilter;
    return matchesSearch && matchesType && matchesStatus;
  });

  return {
    isLoading,
    filteredBroadcasts,
    searchQuery,
    setSearchQuery,
    typeFilter,
    setTypeFilter,
    statusFilter,
    setStatusFilter,
    isCreateOpen,
    setIsCreateOpen,
    isEditOpen,
    setIsEditOpen,
    isSubmitting,
    deleteTargetId,
    setDeleteTargetId,
    selectedUsers,
    formData,
    setFormData,
    handleSelectedUsersChange,
    openCreate,
    openEdit,
    handleCreate,
    handleUpdate,
    confirmDelete,
    handleToggle,
  };
}
