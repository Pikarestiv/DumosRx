"use client";

import { useState, Suspense } from "react";
import { Download, Bell, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  useAdminUsers,
  useDeactivateUserMutation,
  useResetUserPasswordMutation,
  useNotifyUserMutation,
  useBulkNotifyUsersMutation,
  useDeleteUserMutation,
  useReactivateUserMutation,
} from "@/lib/api/admin-hooks";
import { useDebounce } from "@/hooks/use-debounce";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { downloadUserDirectoryCsv } from "@/lib/admin-user-export";

import { AdminSkeleton } from "@/components/admin/admin-skeleton";
import { DeactivateUserDialog } from "@/components/admin/users/deactivate-user-dialog";
import { ReactivateUserDialog } from "@/components/admin/users/reactivate-user-dialog";
import { ResetPasswordDialog } from "@/components/admin/users/reset-password-dialog";
import { UserProfileDialog } from "@/components/admin/users/user-profile-dialog";
import { SendNotificationDialog } from "@/components/admin/users/send-notification-dialog";
import { DeleteUserDialog } from "@/components/admin/users/delete-user-dialog";
import { UserTable } from "@/components/admin/users/user-table";
import { useUserPlanActions } from "@/components/admin/users/use-user-plan-actions";
import { SharedGrantTrialDialog } from "@/components/admin/shared-grant-trial-dialog";
import { SharedActivatePlanDialog } from "@/components/admin/shared-activate-plan-dialog";
import { UserPagination } from "@/components/admin/users/user-pagination";
import { BulkNotifyDialog } from "@/components/admin/users/bulk-notify-dialog";
import type { AdminAccountType, AdminUser } from "@/lib/types/admin";
import { ROLE_FILTER_SLUGS } from "@/components/admin/users/user-directory-filters";
import { UserDirectoryToolbar } from "@/components/admin/users/user-directory-toolbar";
import { useAdminAuthStore, checkHasPermission } from "@/lib/store/use-admin-auth-store";

function GlobalUsersDirectoryContent() {
  const router = useRouter();
  const { user: viewerUser } = useAdminAuthStore();
  const canSendNotifications = checkHasPermission(viewerUser, "send_notifications");
  const searchParams = useSearchParams();
  const initialSearch = searchParams ? searchParams.get("search") || "" : "";

  const [page, setPage] = useState(1);
  const [search, setSearch] = useState(initialSearch);
  const [prevInitialSearch, setPrevInitialSearch] = useState(initialSearch);
  const [roleFilter, setRoleFilter] = useState<string | null>(null);
  const [accountType, setAccountType] = useState<AdminAccountType>("owners");
  const [selectedUser, setSelectedUser] = useState<AdminUser | null>(null);

  if (initialSearch !== prevInitialSearch) {
    setPrevInitialSearch(initialSearch);
    if (initialSearch && initialSearch !== search) {
      setSearch(initialSearch);
    }
  }

  const [isDeactivateDialogOpen, setIsDeactivateDialogOpen] = useState(false);
  const [isReactivateDialogOpen, setIsReactivateDialogOpen] = useState(false);
  const [isResetDialogOpen, setIsResetDialogOpen] = useState(false);
  const [isProfileDialogOpen, setIsProfileDialogOpen] = useState(false);
  const [isNotifyDialogOpen, setIsNotifyDialogOpen] = useState(false);
  const [isBulkNotifyDialogOpen, setIsBulkNotifyDialogOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);

  const debouncedSearch = useDebounce(search, 500);

  const {
    data: response,
    isLoading,
    error,
    refetch,
  } = useAdminUsers(
    page,
    debouncedSearch,
    roleFilter ? ROLE_FILTER_SLUGS[roleFilter] || "" : "",
    accountType,
  );

  const handleAccountTypeChange = (next: AdminAccountType) => {
    setAccountType(next);
    setRoleFilter(null);
    setPage(1);
  };

  const deactivateMutation = useDeactivateUserMutation();
  const reactivateMutation = useReactivateUserMutation();
  const resetPasswordMutation = useResetUserPasswordMutation();
  const notifyMutation = useNotifyUserMutation();
  const deleteMutation = useDeleteUserMutation();
  const bulkNotifyMutation = useBulkNotifyUsersMutation();

  const handlePageChange = (newPage: number) => {
    if (newPage >= 1 && newPage <= (response?.meta?.last_page || 1)) {
      setPage(newPage);
    }
  };

  const userList = response?.data || [];
  const userMeta = response?.meta;

  const handleExportCSV = () => {
    if (!downloadUserDirectoryCsv(userList)) {
      toast.error("Nothing to export yet", {
        description: "This page of the user list is empty.",
      });
    }
  };

  const {
    isTrialDialogOpen,
    setIsTrialDialogOpen,
    isActivatePlanDialogOpen,
    setIsActivatePlanDialogOpen,
    handleGrantTrial,
    handleActivatePlan,
    isGrantingTrial,
    isActivatingPlan,
  } = useUserPlanActions(selectedUser, setSelectedUser, () => void refetch());

  if (isLoading && !response) {
    return <AdminSkeleton />;
  }

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-4xl font-black tracking-tight text-slate-900 dark:text-white">
            Platform Users
          </h1>
          <p className="text-slate-500 dark:text-slate-400 mt-1 font-medium">
            Monitor and manage all users across the platform ecosystem
          </p>
        </div>
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 w-full md:w-auto mt-2 sm:mt-0">
          <div className="flex gap-3 w-full sm:w-auto">
            {canSendNotifications && (
              <Button
                variant="secondary"
                className="rounded-xl font-bold flex-1 sm:flex-none bg-indigo-50 hover:bg-indigo-100 text-indigo-700 dark:bg-indigo-500/10 dark:text-indigo-400 dark:hover:bg-indigo-500/20"
                onClick={() => setIsBulkNotifyDialogOpen(true)}
                title="Notify All Filtered"
              >
                <Bell className="h-4 w-4 sm:mr-2" />
                <span className="hidden sm:inline">Notify All</span>
              </Button>
            )}
            <Button
              variant="outline"
              className="rounded-xl font-bold flex-1 sm:flex-none border-2"
              onClick={handleExportCSV}
              title="Export User List"
            >
              <Download className="h-4 w-4 sm:mr-2" />
              <span className="hidden sm:inline">
                Export this page ({userList.length})
              </span>
            </Button>
          </div>
          <Button
            className="bg-indigo-600 hover:bg-indigo-700 font-bold shadow-lg shadow-indigo-600/20 w-full sm:w-auto"
            onClick={() => router.push("/admin/users/new")}
          >
            <UserPlus className="h-4 w-4 mr-2" />
            Add Platform Admin
          </Button>
        </div>
      </div>

      <Card className="border-none shadow-sm overflow-hidden bg-white dark:bg-slate-900">
        <CardContent className="p-0">
          <UserDirectoryToolbar
            accountType={accountType}
            onAccountTypeChange={handleAccountTypeChange}
            search={search}
            onSearchChange={setSearch}
            roleFilter={roleFilter}
            onRoleFilterChange={(label) => { setRoleFilter(label); setPage(1); }}
            isLoading={isLoading}
            total={userMeta?.total || 0}
          />

          <div className="overflow-x-auto min-h-[400px]">
            <UserTable 
              userList={userList}
              isLoading={isLoading}
              error={error}
              refetch={() => void refetch()}
              setSelectedUser={setSelectedUser}
              setIsProfileDialogOpen={setIsProfileDialogOpen}
              setIsNotifyDialogOpen={setIsNotifyDialogOpen}
              setIsResetDialogOpen={setIsResetDialogOpen}
              setIsDeactivateDialogOpen={setIsDeactivateDialogOpen}
              setIsReactivateDialogOpen={setIsReactivateDialogOpen}
              setIsDeleteDialogOpen={setIsDeleteDialogOpen}
              setIsTrialDialogOpen={setIsTrialDialogOpen}
              setIsActivatePlanDialogOpen={setIsActivatePlanDialogOpen}
            />
          </div>

          <UserPagination userMeta={userMeta} handlePageChange={handlePageChange} />
        </CardContent>
      </Card>

      <DeactivateUserDialog
        isOpen={isDeactivateDialogOpen}
        onOpenChange={setIsDeactivateDialogOpen}
        selectedUser={selectedUser}
        setSelectedUser={setSelectedUser}
        deactivateMutation={deactivateMutation}
      />

      <ReactivateUserDialog
        isOpen={isReactivateDialogOpen}
        onOpenChange={setIsReactivateDialogOpen}
        selectedUser={selectedUser}
        setSelectedUser={setSelectedUser}
        reactivateMutation={reactivateMutation}
      />

      <ResetPasswordDialog
        isOpen={isResetDialogOpen}
        onOpenChange={setIsResetDialogOpen}
        selectedUser={selectedUser}
        setSelectedUser={setSelectedUser}
        resetPasswordMutation={resetPasswordMutation}
      />

      <UserProfileDialog
        isOpen={isProfileDialogOpen}
        onOpenChange={setIsProfileDialogOpen}
        selectedUser={selectedUser}
      />

      <SendNotificationDialog
        isOpen={isNotifyDialogOpen}
        onOpenChange={setIsNotifyDialogOpen}
        selectedUser={selectedUser}
        setSelectedUser={setSelectedUser}
        notifyMutation={notifyMutation}
      />

      <DeleteUserDialog
        isOpen={isDeleteDialogOpen}
        onOpenChange={setIsDeleteDialogOpen}
        selectedUser={selectedUser}
        setSelectedUser={setSelectedUser}
        deleteMutation={deleteMutation}
      />

      <SharedGrantTrialDialog
        open={isTrialDialogOpen}
        onOpenChange={setIsTrialDialogOpen}
        targetName={selectedUser?.name}
        onConfirm={handleGrantTrial}
        isPending={isGrantingTrial}
      />

      <SharedActivatePlanDialog
        open={isActivatePlanDialogOpen}
        onOpenChange={setIsActivatePlanDialogOpen}
        targetName={selectedUser?.name}
        onConfirm={handleActivatePlan}
        isPending={isActivatingPlan}
      />

      <BulkNotifyDialog
        isOpen={isBulkNotifyDialogOpen}
        onOpenChange={setIsBulkNotifyDialogOpen}
        recipientCount={userMeta?.total || 0}
        filters={{
          account_type: accountType,
          role: roleFilter ? ROLE_FILTER_SLUGS[roleFilter] : undefined,
          search: debouncedSearch || undefined,
        }}
        bulkNotifyMutation={bulkNotifyMutation}
      />
    </div>
  );
}

export default function GlobalUsersDirectory() {
  return (
    <Suspense fallback={<AdminSkeleton />}>
      <GlobalUsersDirectoryContent />
    </Suspense>
  );
}
