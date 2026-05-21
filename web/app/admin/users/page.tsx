"use client";

import { useState } from "react";
import { 
  Search, 
  Filter, 
  Download,
  Bell,
  UserPlus, 
  ChevronLeft, 
  ChevronRight, 
  Loader2
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";


import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Card, CardContent } from "@/components/ui/card";
import { 
  useAdminUsers, 
  useDeactivateUserMutation, 
  useResetUserPasswordMutation, 
  useNotifyUserMutation 
} from "@/lib/api/admin-hooks";
import { useDebounce } from "@/hooks/use-debounce";
import { useRouter } from "next/navigation";
import { toast } from "sonner";


import { AdminSkeleton } from "@/components/admin/admin-skeleton";
import {
  DeactivateUserDialog,
  ResetPasswordDialog,
  UserProfileDialog,
  SendNotificationDialog,
} from "@/components/admin/users/user-dialogs";
import { UserTable } from "@/components/admin/users/user-table";

export default function GlobalUsersDirectory() {
  const router = useRouter();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<string | null>(null);
  const [selectedUser, setSelectedUser] = useState<any>(null);
  
  const [isDeactivateDialogOpen, setIsDeactivateDialogOpen] = useState(false);
  const [isResetDialogOpen, setIsResetDialogOpen] = useState(false);
  const [isProfileDialogOpen, setIsProfileDialogOpen] = useState(false);
  const [isNotifyDialogOpen, setIsNotifyDialogOpen] = useState(false);
  const [_isBulkNotifyDialogOpen, setIsBulkNotifyDialogOpen] = useState(false);
  
  const debouncedSearch = useDebounce(search, 500);

  const { data: response, isLoading, error, refetch } = useAdminUsers(page, debouncedSearch);
  const deactivateMutation = useDeactivateUserMutation();
  const resetPasswordMutation = useResetUserPasswordMutation();
  const notifyMutation = useNotifyUserMutation();

  const handlePageChange = (newPage: number) => {
    if (newPage >= 1 && newPage <= (response?.meta?.last_page || 1)) {
      setPage(newPage);
    }
  };

  const userList = response?.data || [];
  const userMeta = response?.meta;

  const handleExportCSV = () => {
    if (userList.length === 0) return;
    const headers = ["ID", "Name", "Email", "Role", "Pharmacy", "Status"];
    const csvData = userList.map((u: any) => 
      [u.id, u.name, u.email, u.role, u.pharmacy, u.status].join(",")
    );
    const blob = new Blob([[headers.join(","), ...csvData].join("\n")], { type: "text/csv" });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `users-export-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    toast.success("User list exported successfully");
  };



  if (isLoading && !response) {
    return <AdminSkeleton />;
  }

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-4xl font-black tracking-tight text-slate-900 dark:text-white">Platform Users</h1>
          <p className="text-slate-500 dark:text-slate-400 mt-1 font-medium">Monitor and manage all users across the platform ecosystem</p>
        </div>
        <div className="flex items-center gap-3">
          <Button 
            className="rounded-xl font-bold bg-indigo-600 hover:bg-indigo-700 text-white"
            onClick={() => setIsBulkNotifyDialogOpen(true)}
          >
            <Bell className="h-4 w-4 mr-2" />
            Notify All Filtered
          </Button>
          <Button 
            variant="outline" 
            className="rounded-xl font-bold"
            onClick={handleExportCSV}
          >
            <Download className="h-4 w-4 mr-2" />
            Export User List
          </Button>
            <Button 
              className="bg-indigo-600 hover:bg-indigo-700 font-bold shadow-lg shadow-indigo-600/20"
              onClick={() => router.push("/admin/users/new")}
            >
                <UserPlus className="h-4 w-4 mr-2" />
                Add Platform Admin
            </Button>
        </div>
      </div>

      <Card className="border-none shadow-sm overflow-hidden bg-white dark:bg-slate-900">
        <CardContent className="p-0">
          <div className="p-6 border-b border-slate-100 dark:border-slate-800 flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="relative w-full max-w-sm group">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 group-focus-within:text-indigo-500 transition-colors" />
              <Input
                placeholder="Search by name, email or pharmacy..."
                className="pl-10 bg-slate-50 dark:bg-slate-800 border-none focus-visible:ring-2 focus-visible:ring-indigo-500"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <div className="flex items-center gap-3">
                {isLoading && <Loader2 className="h-4 w-4 animate-spin text-indigo-500 mr-2" />}
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" size="sm" className="font-bold border-2">
                        <Filter className="h-4 w-4 mr-2" />
                        {roleFilter || 'Roles'}
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-48 p-2 rounded-2xl shadow-xl">
                    <DropdownMenuLabel className="text-[10px] uppercase tracking-widest text-slate-400 px-3 py-2">System Role</DropdownMenuLabel>
                    <DropdownMenuItem className="rounded-xl px-3 py-2 cursor-pointer font-bold" onClick={() => setRoleFilter(null)}>All Roles</DropdownMenuItem>
                    <DropdownMenuItem className="rounded-xl px-3 py-2 cursor-pointer font-bold" onClick={() => setRoleFilter('Super Admin')}>Super Admin</DropdownMenuItem>
                    <DropdownMenuItem className="rounded-xl px-3 py-2 cursor-pointer font-bold" onClick={() => setRoleFilter('Pharmacy Owner')}>Pharmacy Owner</DropdownMenuItem>
                    <DropdownMenuItem className="rounded-xl px-3 py-2 cursor-pointer font-bold" onClick={() => setRoleFilter('Pharmacist')}>Pharmacist</DropdownMenuItem>
                    <DropdownMenuSeparator className="my-2" />
                    <DropdownMenuLabel className="text-[10px] uppercase tracking-widest text-slate-400 px-3 py-2">Billing Plan</DropdownMenuLabel>
                    <DropdownMenuItem className="rounded-xl px-3 py-2 cursor-pointer font-bold">Basic</DropdownMenuItem>
                    <DropdownMenuItem className="rounded-xl px-3 py-2 cursor-pointer font-bold">Enterprise</DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
                <div className="h-8 w-px bg-slate-200 dark:bg-slate-800 mx-1 hidden md:block" />
                <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Global Directory: {userMeta?.total || 0} Users</p>
            </div>
          </div>

          <div className="overflow-x-auto min-h-[400px]">
            <UserTable 
              userList={userList}
              isLoading={isLoading}
              error={error}
              refetch={refetch}
              setSelectedUser={setSelectedUser}
              setIsProfileDialogOpen={setIsProfileDialogOpen}
              setIsNotifyDialogOpen={setIsNotifyDialogOpen}
              setIsResetDialogOpen={setIsResetDialogOpen}
              setIsDeactivateDialogOpen={setIsDeactivateDialogOpen}
            />
          </div>

          {userMeta && userMeta.last_page > 1 && (
            <div className="p-6 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between bg-slate-50/50 dark:bg-slate-800/30">
              <p className="text-xs font-bold text-slate-500 uppercase tracking-widest">Page {userMeta.current_page} of {userMeta.last_page}</p>
              <div className="flex items-center gap-2">
                  <Button 
                    variant="outline" 
                    size="sm" 
                    disabled={userMeta.current_page === 1}
                    onClick={() => handlePageChange(userMeta.current_page - 1)}
                    className="h-8 border-2 font-black text-xs uppercase tracking-tighter"
                  >
                      <ChevronLeft className="h-4 w-4 mr-1" />
                      Prev
                  </Button>
                  <div className="flex gap-1">
                      {Array.from({ length: Math.min(5, userMeta.last_page) }, (_, i) => {
                          const pageNum = i + 1;
                          return (
                            <Button 
                                key={i} 
                                variant={pageNum === userMeta.current_page ? "default" : "ghost"} 
                                size="sm" 
                                onClick={() => handlePageChange(pageNum)}
                                className={`h-8 w-8 p-0 font-bold ${pageNum === userMeta.current_page ? 'bg-indigo-600' : ''}`}
                            >
                                {pageNum}
                            </Button>
                          );
                      })}
                      {userMeta.last_page > 5 && <span className="px-2 text-slate-400">...</span>}
                  </div>
                  <Button 
                    variant="outline" 
                    size="sm" 
                    disabled={userMeta.current_page === userMeta.last_page}
                    onClick={() => handlePageChange(userMeta.current_page + 1)}
                    className="h-8 border-2 font-black text-xs uppercase tracking-tighter"
                  >
                      Next
                      <ChevronRight className="h-4 w-4 ml-1" />
                  </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <DeactivateUserDialog
        isOpen={isDeactivateDialogOpen}
        onOpenChange={setIsDeactivateDialogOpen}
        selectedUser={selectedUser}
        setSelectedUser={setSelectedUser}
        deactivateMutation={deactivateMutation}
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
    </div>
  );
}
