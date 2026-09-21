"use client";

import { useState } from "react";
import { 
  Plus, 
  Loader2, 
  Search, 
  Filter, 
  MoreVertical, 
  Trash2, 
  Edit, 
  CheckCircle, 
  XCircle,
  AlertTriangle,
  Info,
  ShieldAlert,
  CheckCircle2
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

import { CreateBroadcastDialog, EditBroadcastDialog } from "@/components/admin/broadcasts/broadcast-dialogs";
import { webApiClient } from "@/lib/api/client";
import { toast } from "sonner";
import { formatDateSafe } from "@/lib/utils/date-utils";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useDeleteBroadcastMutation } from "@/lib/api/admin-hooks";
import type { AdminBroadcast, AdminUser, BroadcastFormData } from "@/lib/types/admin";

const TYPE_FILTERS = [
  { label: "All Types", value: "" },
  { label: "Info", value: "info" },
  { label: "Warning", value: "warning" },
  { label: "Danger", value: "danger" },
  { label: "Success", value: "success" },
];

const STATUS_FILTERS = [
  { label: "All Statuses", value: "" },
  { label: "Live", value: "live" },
  { label: "Inactive", value: "inactive" },
  { label: "Expired", value: "expired" },
];

const broadcastStatus = (broadcast: AdminBroadcast): "live" | "inactive" | "expired" => {
  if (!broadcast.is_active) return "inactive";
  const expiry = broadcast.expires_at ? new Date(broadcast.expires_at) : null;
  if (expiry && !isNaN(expiry.getTime()) && expiry < new Date()) return "expired";
  return "live";
};

export function BroadcastsTab() {
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

  // Display-only companion to formData.user_ids: the selector renders whole
  // user objects, but only their ids are ever submitted (the backend matches
  // recipients with whereJsonContains('user_ids', $user->id)).
  const [selectedUsers, setSelectedUsers] = useState<AdminUser[]>([]);

  // Form state
  const [formData, setFormData] = useState<BroadcastFormData>({
    title: "",
    message: "",
    type: "info",
    target_type: "all",
    user_ids: [],
    expires_at: "",
    is_active: true
  });

  // Keeps the display list and the submitted id list in lockstep.
  const handleSelectedUsersChange = (users: AdminUser[]) => {
    setSelectedUsers(users);
    setFormData((prev) => ({ ...prev, user_ids: users.map((u) => u.id) }));
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
      setFormData({
        title: "",
        message: "",
        type: "info",
        target_type: "all",
        user_ids: [],
        expires_at: "",
        is_active: true
      });
      void queryClient.invalidateQueries({ queryKey: ["admin-broadcasts"] });
      void queryClient.invalidateQueries({ queryKey: ["broadcasts"] });
    } catch (_error) {
      toast.error("Failed to create broadcast");
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
      void queryClient.invalidateQueries({ queryKey: ["admin-broadcasts"] });
      void queryClient.invalidateQueries({ queryKey: ["broadcasts"] });
    } catch (_error) {
      toast.error("Failed to update broadcast");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = (id: string) => {
    setDeleteTargetId(id);
  };

  const confirmDelete = (id: string) => {
    deleteMutation.mutate(id, {
      onSuccess: () => {
        toast.success("Broadcast deleted");
        void queryClient.invalidateQueries({ queryKey: ["admin-broadcasts"] });
        setDeleteTargetId(null);
      },
      onError: () => {
        toast.error("Failed to delete broadcast");
        setDeleteTargetId(null);
      }
    });
  };

  const handleToggle = async (id: string) => {
    try {
      await webApiClient.toggleBroadcast(id);
      void queryClient.invalidateQueries({ queryKey: ["admin-broadcasts"] });
      void queryClient.invalidateQueries({ queryKey: ["broadcasts"] });
    } catch (_error) {
      toast.error("Failed to toggle status");
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

  const getStatusBadge = (broadcast: AdminBroadcast) => {
    const status = broadcastStatus(broadcast);
    if (status === "inactive") return <Badge variant="outline" className="bg-slate-100 text-slate-500 border-slate-200 font-bold">Inactive</Badge>;
    if (status === "expired") return <Badge variant="outline" className="bg-amber-100 text-amber-600 border-amber-200 font-bold">Expired</Badge>;
    return <Badge variant="outline" className="bg-emerald-100 text-emerald-600 border-emerald-200 font-bold">Live</Badge>;
  };

  const getTypeIcon = (type: string) => {
    switch(type) {
      case 'danger': return <ShieldAlert className="h-4 w-4 text-rose-500" />;
      case 'warning': return <AlertTriangle className="h-4 w-4 text-amber-500" />;
      case 'success': return <CheckCircle2 className="h-4 w-4 text-emerald-500" />;
      default: return <Info className="h-4 w-4 text-indigo-500" />;
    }
  };

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-4xl font-black tracking-tight text-slate-900 dark:text-white">Broadcast System</h1>
          <p className="text-slate-500 dark:text-slate-400 mt-1 font-medium italic">
            Send global alerts and updates to all connected instances
          </p>
        </div>
        <Button 
          className="bg-indigo-600 hover:bg-indigo-700 font-bold shadow-lg shadow-indigo-600/20 rounded-2xl h-12"
          onClick={() => {
            setSelectedUsers([]);
            setFormData({
              title: "",
              message: "",
              type: "info",
              target_type: "all",
              user_ids: [],
              expires_at: "",
              is_active: true
            });
            setIsCreateOpen(true);
          }}
        >
          <Plus className="h-4 w-4 mr-2" />
          New Broadcast
        </Button>
      </div>

      <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
        <div className="p-6 border-b border-slate-100 dark:border-slate-800 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <Input 
              placeholder="Search broadcasts..." 
              className="pl-11 bg-slate-50 dark:bg-slate-800 border-none rounded-2xl h-11 focus-visible:ring-indigo-500 font-bold"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
          <div className="flex items-center gap-2">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" className="rounded-xl font-bold border-slate-200 dark:border-slate-800">
                  <Filter className="h-4 w-4 mr-2" />
                  {typeFilter || statusFilter
                    ? [
                        TYPE_FILTERS.find((f) => f.value === typeFilter)?.label,
                        STATUS_FILTERS.find((f) => f.value === statusFilter)?.label,
                      ]
                        .filter((label) => label && !label.startsWith("All"))
                        .join(" · ")
                    : "Filters"}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-52 rounded-xl border-slate-200 dark:border-slate-800 p-1">
                <DropdownMenuLabel className="text-[10px] uppercase tracking-widest text-slate-400 px-3 py-2">
                  Alert Type
                </DropdownMenuLabel>
                {TYPE_FILTERS.map((f) => (
                  <DropdownMenuItem
                    key={`type-${f.value}`}
                    className="rounded-lg font-bold cursor-pointer"
                    onClick={() => setTypeFilter(f.value)}
                  >
                    {f.label}
                  </DropdownMenuItem>
                ))}
                <DropdownMenuLabel className="text-[10px] uppercase tracking-widest text-slate-400 px-3 py-2">
                  Status
                </DropdownMenuLabel>
                {STATUS_FILTERS.map((f) => (
                  <DropdownMenuItem
                    key={`status-${f.value}`}
                    className="rounded-lg font-bold cursor-pointer"
                    onClick={() => setStatusFilter(f.value)}
                  >
                    {f.label}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent border-slate-100 dark:border-slate-800">
                <TableHead className="font-bold text-[10px] uppercase text-slate-400 pl-6">Content</TableHead>
                <TableHead className="font-bold text-[10px] uppercase text-slate-400 text-center">Type</TableHead>
                <TableHead className="font-bold text-[10px] uppercase text-slate-400 text-center">Audience</TableHead>
                <TableHead className="font-bold text-[10px] uppercase text-slate-400 text-center">Status</TableHead>
                <TableHead className="font-bold text-[10px] uppercase text-slate-400 text-right pr-6">Expiry</TableHead>
                <TableHead className="w-[50px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-20">
                    <Loader2 className="h-10 w-10 text-indigo-500 animate-spin mx-auto" />
                    <p className="text-slate-400 font-bold mt-4 italic">Fetching broadcast logs...</p>
                  </TableCell>
                </TableRow>
              ) : filteredBroadcasts.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-20 text-slate-400 font-medium">
                    No broadcasts found
                  </TableCell>
                </TableRow>
              ) : (
                filteredBroadcasts.map((broadcast) => (
                  <TableRow key={broadcast.id} className="border-slate-100 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/50 group">
                    <TableCell className="pl-6 py-4">
                      <div className="flex flex-col max-w-md">
                        <span className="font-bold text-slate-900 dark:text-slate-100">{broadcast.title}</span>
                        <span className="text-xs text-slate-500 truncate">{broadcast.message}</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-center">
                      <div className="flex items-center justify-center">
                        <div className={`p-2 rounded-xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center`}>
                          {getTypeIcon(broadcast.type)}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="text-center">
                      <Badge className="bg-indigo-500/10 text-indigo-600 border-none font-bold uppercase text-[10px]">
                        {broadcast.target_type}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-center">
                      {getStatusBadge(broadcast)}
                    </TableCell>
                    <TableCell className="text-right pr-6">
                      <div className="flex flex-col items-end">
                        <span className="text-sm font-bold text-slate-700 dark:text-slate-300">
                          {broadcast.expires_at
                            ? formatDateSafe(broadcast.expires_at, "MMM d, yyyy", "Unknown date")
                            : "Never"}
                        </span>
                        {broadcast.expires_at && (
                          <span className="text-[10px] text-slate-400 font-medium uppercase tracking-tighter">
                            {formatDateSafe(broadcast.expires_at, "HH:mm", "")}
                          </span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full">
                            <MoreVertical className="h-4 w-4 text-slate-400" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-48 rounded-xl border-slate-200 dark:border-slate-800 p-1">
                          <DropdownMenuItem 
                            className="rounded-lg gap-2 font-bold cursor-pointer"
                            onClick={() => {
                              setSelectedBroadcast(broadcast);
                              // The selector only has ids to work from here, so
                              // it starts empty; the existing ids are kept in
                              // formData until the admin picks a new set.
                              setSelectedUsers([]);
                              setFormData({
                                title: broadcast.title,
                                message: broadcast.message,
                                type: broadcast.type,
                                target_type: broadcast.target_type || "all",
                                user_ids: broadcast.user_ids || [],
                                // Robust to both "2026-01-01T00:00:00Z" and
                                // "2026-01-01 00:00:00" (and to garbage).
                                expires_at: formatDateSafe(broadcast.expires_at, "yyyy-MM-dd", ""),
                                is_active: broadcast.is_active
                              });
                              setIsEditOpen(true);
                            }}
                          >
                            <Edit className="h-4 w-4 text-indigo-500" />
                            Edit Broadcast
                          </DropdownMenuItem>
                          <DropdownMenuItem 
                            className="rounded-lg gap-2 font-bold cursor-pointer"
                            onClick={() => void handleToggle(broadcast.id)}
                          >
                            {broadcast.is_active ? (
                              <><XCircle className="h-4 w-4 text-amber-500" /> Deactivate</>
                            ) : (
                              <><CheckCircle className="h-4 w-4 text-emerald-500" /> Activate</>
                            )}
                          </DropdownMenuItem>
                          <DropdownMenuItem 
                            className="rounded-lg gap-2 font-bold text-rose-500 hover:text-rose-600 hover:bg-rose-50 cursor-pointer"
                            onClick={() => handleDelete(broadcast.id)}
                          >
                            <Trash2 className="h-4 w-4" />
                            Delete Permanent
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      <CreateBroadcastDialog
        isOpen={isCreateOpen}
        onOpenChange={setIsCreateOpen}
        formData={formData}
        setFormData={setFormData}
        selectedUsers={selectedUsers}
        onSelectedUsersChange={handleSelectedUsersChange}
        onSubmit={(e) => void handleCreate(e)}
        isSubmitting={isSubmitting}
      />

      <EditBroadcastDialog
        isOpen={isEditOpen}
        onOpenChange={setIsEditOpen}
        formData={formData}
        setFormData={setFormData}
        selectedUsers={selectedUsers}
        onSelectedUsersChange={handleSelectedUsersChange}
        onSubmit={(e) => void handleUpdate(e)}
        isSubmitting={isSubmitting}
      />

      <ConfirmDialog
        open={!!deleteTargetId}
        onOpenChange={(open) => { if (!open) setDeleteTargetId(null); }}
        title="Delete Broadcast"
        description="Are you sure you want to delete this broadcast? This action cannot be undone."
        confirmLabel="Delete"
        onConfirm={() => deleteTargetId && confirmDelete(deleteTargetId)}
      />
    </div>
  );
}
