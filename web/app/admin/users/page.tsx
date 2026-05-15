"use client";

import { useEffect, useState } from "react";
import { 
  Search, 
  Filter, 
  MoreVertical, 
  Shield, 
  UserPlus, 
  Mail, 
  Lock, 
  Eye, 
  Store, 
  Ban, 
  ChevronLeft, 
  ChevronRight, 
  Download,
  Loader2,
  ShieldAlert,
  Send,
  Calendar,
  Activity,
  History,
  Briefcase
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
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
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Card, CardContent } from "@/components/ui/card";
import { useAdminStore } from "@/lib/store/use-admin-store";
import { useDebounce } from "@/hooks/use-debounce";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { webApiClient } from "@/lib/api/client";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";

export default function GlobalUsersDirectory() {
  const router = useRouter();
  const { users, userMeta, loading, error, fetchUsers } = useAdminStore();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<string | null>(null);
  const [selectedUser, setSelectedUser] = useState<any>(null);
  const [isDeactivateDialogOpen, setIsDeactivateDialogOpen] = useState(false);
  const [isResetDialogOpen, setIsResetDialogOpen] = useState(false);
  const [isProfileDialogOpen, setIsProfileDialogOpen] = useState(false);
  const [isNotifyDialogOpen, setIsNotifyDialogOpen] = useState(false);
  const [notifyMessage, setNotifyMessage] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const debouncedSearch = useDebounce(search, 500);

  useEffect(() => {
    fetchUsers(page, debouncedSearch);
  }, [page, debouncedSearch, fetchUsers]);

  const handlePageChange = (newPage: number) => {
    if (newPage >= 1 && newPage <= (userMeta?.last_page || 1)) {
      setPage(newPage);
    }
  };

  const userList = users || [];

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

  const handleDeactivate = async () => {
    if (!selectedUser) return;
    setIsProcessing(true);
    try {
      await webApiClient.request(`admin/users/${selectedUser.id}/deactivate`, { method: 'POST' });
      toast.success("Account Deactivated", {
        description: `${selectedUser.name}'s account has been disabled.`
      });
      fetchUsers(page, debouncedSearch);
    } catch (err: any) {
      toast.error("Action Failed", { description: err.message || "Failed to deactivate user" });
    } finally {
      setIsProcessing(false);
      setIsDeactivateDialogOpen(false);
      setSelectedUser(null);
    }
  };

  const handlePasswordReset = async () => {
    if (!selectedUser) return;
    setIsProcessing(true);
    try {
      await webApiClient.request(`admin/users/${selectedUser.id}/reset-password`, { method: 'POST' });
      toast.success("Password Reset Forced", {
        description: `A password reset link has been sent to ${selectedUser.email}`
      });
    } catch (err: any) {
      toast.error("Action Failed", { description: err.message || "Failed to force password reset" });
    } finally {
      setIsProcessing(false);
      setIsResetDialogOpen(false);
      setSelectedUser(null);
    }
  };

  const handleSendNotification = async () => {
    if (!selectedUser || !notifyMessage) return;
    setIsProcessing(true);
    try {
      await webApiClient.request(`admin/users/${selectedUser.id}/notify`, { 
        method: 'POST',
        body: { message: notifyMessage }
      });
      toast.success("Notification Sent", {
        description: `Message successfully delivered to ${selectedUser.name}`
      });
      setNotifyMessage("");
      setIsNotifyDialogOpen(false);
    } catch (err: any) {
      toast.error("Failed to Send", { description: err.message });
    } finally {
      setIsProcessing(false);
      setSelectedUser(null);
    }
  };

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-4xl font-black tracking-tight text-slate-900 dark:text-white">Platform Users</h1>
          <p className="text-slate-500 dark:text-slate-400 mt-1 font-medium">Monitor and manage all users across the platform ecosystem</p>
        </div>
        <div className="flex items-center gap-3">
            <Button 
              variant="outline" 
              className="border-2 font-bold dark:bg-slate-900 dark:border-slate-800"
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
                {loading && <Loader2 className="h-4 w-4 animate-spin text-indigo-500 mr-2" />}
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
            {error ? (
              <div className="flex flex-col items-center justify-center py-20 gap-4">
                <ShieldAlert className="h-10 w-10 text-rose-500" />
                <p className="text-rose-500 font-bold">{error}</p>
                <Button onClick={() => fetchUsers(page, debouncedSearch)} variant="outline">Retry</Button>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/30">
                    <TableHead className="font-bold text-[10px] uppercase text-slate-400 pl-6 h-12">User Profile</TableHead>
                    <TableHead className="font-bold text-[10px] uppercase text-slate-400 h-12">System Role</TableHead>
                    <TableHead className="font-bold text-[10px] uppercase text-slate-400 h-12">Parent Pharmacy</TableHead>
                    <TableHead className="font-bold text-[10px] uppercase text-slate-400 text-center h-12">Last Active</TableHead>
                    <TableHead className="font-bold text-[10px] uppercase text-slate-400 text-center h-12">Status</TableHead>
                    <TableHead className="w-[80px] h-12"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {userList.map((user: any) => (
                    <TableRow key={user.id} className="border-slate-100 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/50 group transition-colors">
                      <TableCell className="pl-6 py-5">
                        <div className="flex items-center gap-4">
                          <div className={`h-10 w-10 rounded-xl ${user.role === 'Super Admin' ? 'bg-indigo-600 shadow-indigo-600/20' : 'bg-slate-100 dark:bg-slate-800'} border border-slate-200 dark:border-slate-700 flex items-center justify-center font-black ${user.role === 'Super Admin' ? 'text-white' : 'text-slate-400'} text-xs shadow-sm`}>
                            {user.name.charAt(0)}
                          </div>
                          <div className="flex flex-col">
                            <span className="font-bold text-slate-900 dark:text-slate-100 group-hover:text-indigo-600 transition-colors">{user.name}</span>
                            <span className="text-[10px] font-mono text-slate-400 uppercase tracking-tighter">{user.id} • {user.email}</span>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className={
                          user.role === 'Super Admin' ? 'bg-indigo-500/10 text-indigo-500 border-indigo-500/20 font-black' :
                          user.role === 'Pharmacy Admin' ? 'bg-blue-500/10 text-blue-500 border-blue-500/20 font-black' :
                          'bg-slate-500/10 text-slate-500 border-slate-500/20 font-bold'
                        }>
                          <Shield className="h-3 w-3 mr-1.5" />
                          {user.role}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Store className="h-3 w-3 text-slate-400" />
                          <span className="font-bold text-sm text-slate-600 dark:text-slate-300">{user.pharmacy}</span>
                        </div>
                      </TableCell>
                      <TableCell className="text-center">
                          <div className="flex flex-col items-center">
                              <span className={`text-xs font-black ${user.lastActive === 'Active Now' ? 'text-green-500' : 'text-slate-500'}`}>{user.lastActive}</span>
                              <span className="text-[9px] text-slate-400 uppercase tracking-widest font-medium">{user.joinedAt}</span>
                          </div>
                      </TableCell>
                      <TableCell className="text-center">
                        <Badge className={
                          user.status === 'Active' ? 'bg-emerald-500 hover:bg-emerald-600' :
                          user.status === 'Suspended' ? 'bg-rose-500 hover:bg-rose-600' :
                          'bg-slate-400 hover:bg-slate-500'
                        }>
                          {user.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="pr-6">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="hover:bg-indigo-50 dark:hover:bg-indigo-500/10">
                              <MoreVertical className="h-4 w-4 text-slate-400" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-60 p-2 rounded-2xl shadow-xl border-slate-200 dark:border-slate-800">
                            <DropdownMenuLabel className="text-[10px] uppercase tracking-widest text-slate-400 px-3 py-2">User Actions</DropdownMenuLabel>
                            <DropdownMenuItem 
                              className="rounded-xl px-3 py-2.5 cursor-pointer gap-3 font-bold"
                              onClick={() => {
                                setSelectedUser(user);
                                setIsProfileDialogOpen(true);
                              }}
                            >
                              <Eye className="h-4 w-4 text-indigo-500" />
                              View Detailed Profile
                            </DropdownMenuItem>
                            <DropdownMenuItem 
                              className="rounded-xl px-3 py-2.5 cursor-pointer gap-3 font-bold"
                              onClick={() => {
                                setSelectedUser(user);
                                setIsNotifyDialogOpen(true);
                              }}
                            >
                              <Mail className="h-4 w-4 text-blue-500" />
                              Send Notification
                            </DropdownMenuItem>
                            <DropdownMenuItem 
                              className="rounded-xl px-3 py-2.5 cursor-pointer gap-3 font-bold"
                              onClick={() => {
                                setSelectedUser(user);
                                setIsResetDialogOpen(true);
                              }}
                            >
                              <Lock className="h-4 w-4 text-amber-500" />
                              Force Password Reset
                            </DropdownMenuItem>
                            <DropdownMenuSeparator className="my-2 bg-slate-100 dark:bg-slate-800" />
                            <DropdownMenuItem 
                              className="rounded-xl px-3 py-2.5 cursor-pointer gap-3 font-bold text-rose-500 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-500/10 transition-colors"
                              onClick={() => {
                                setSelectedUser(user);
                                setIsDeactivateDialogOpen(true);
                              }}
                            >
                              <Ban className="h-4 w-4" />
                              Deactivate Account
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  ))}
                  {userList.length === 0 && !loading && (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center py-20 text-slate-400 font-medium">
                        <div className="flex flex-col items-center gap-2">
                           <ShieldAlert className="h-10 w-10 opacity-20" />
                           <span>No users found matching your search</span>
                        </div>
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            )}
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

      {/* Deactivate Dialog */}
      <Dialog open={isDeactivateDialogOpen} onOpenChange={setIsDeactivateDialogOpen}>
        <DialogContent className="rounded-3xl border-slate-200 dark:border-slate-800 shadow-2xl">
          <DialogHeader>
            <DialogTitle className="text-2xl font-black flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-rose-500/10 flex items-center justify-center">
                <Ban className="h-5 w-5 text-rose-500" />
              </div>
              Deactivate User Account?
            </DialogTitle>
            <DialogDescription className="text-slate-500 dark:text-slate-400 font-medium pt-2">
              Are you sure you want to deactivate <span className="font-bold text-slate-900 dark:text-white">{selectedUser?.name}</span>? 
              They will be immediately logged out and unable to access the platform until reactivated.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 pt-4">
            <Button variant="outline" onClick={() => setIsDeactivateDialogOpen(false)} className="rounded-xl border-2 font-bold h-12">Cancel</Button>
            <Button 
              onClick={handleDeactivate}
              className="rounded-xl bg-rose-500 hover:bg-rose-600 text-white font-bold h-12 shadow-lg shadow-rose-500/20"
              disabled={isProcessing}
            >
              {isProcessing ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Deactivate Account
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Password Reset Dialog */}
      <Dialog open={isResetDialogOpen} onOpenChange={setIsResetDialogOpen}>
        <DialogContent className="rounded-3xl border-slate-200 dark:border-slate-800 shadow-2xl">
          <DialogHeader>
            <DialogTitle className="text-2xl font-black flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-amber-500/10 flex items-center justify-center">
                <Lock className="h-5 w-5 text-amber-500" />
              </div>
              Force Password Reset?
            </DialogTitle>
            <DialogDescription className="text-slate-500 dark:text-slate-400 font-medium pt-2">
              This will invalidate <span className="font-bold text-slate-900 dark:text-white">{selectedUser?.name}</span>'s current password 
              and send a secure reset link to <span className="font-bold text-slate-900 dark:text-white">{selectedUser?.email}</span>.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 pt-4">
            <Button variant="outline" onClick={() => setIsResetDialogOpen(false)} className="rounded-xl border-2 font-bold h-12">Cancel</Button>
            <Button 
              onClick={handlePasswordReset}
              className="rounded-xl bg-amber-500 hover:bg-amber-600 text-white font-bold h-12 shadow-lg shadow-amber-500/20"
              disabled={isProcessing}
            >
              {isProcessing ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Confirm Reset
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Detailed Profile Dialog */}
      <Dialog open={isProfileDialogOpen} onOpenChange={setIsProfileDialogOpen}>
        <DialogContent className="max-w-2xl rounded-3xl border-slate-200 dark:border-slate-800 shadow-2xl p-0 overflow-hidden">
          <DialogHeader className="sr-only">
            <DialogTitle>User Detailed Profile</DialogTitle>
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
          <div className="p-8 grid grid-cols-2 gap-6">
            <div className="space-y-4">
              <div className="flex items-center gap-3 text-slate-500">
                <Store className="h-4 w-4" />
                <div>
                  <p className="text-[10px] uppercase font-bold tracking-widest opacity-50">Affiliated Pharmacy</p>
                  <p className="text-sm font-black text-slate-900 dark:text-white">{selectedUser?.pharmacy}</p>
                </div>
              </div>
              <div className="flex items-center gap-3 text-slate-500">
                <Calendar className="h-4 w-4" />
                <div>
                  <p className="text-[10px] uppercase font-bold tracking-widest opacity-50">Member Since</p>
                  <p className="text-sm font-black text-slate-900 dark:text-white">{selectedUser?.joinedAt || 'N/A'}</p>
                </div>
              </div>
            </div>
            <div className="space-y-4">
              <div className="flex items-center gap-3 text-slate-500">
                <Activity className="h-4 w-4" />
                <div>
                  <p className="text-[10px] uppercase font-bold tracking-widest opacity-50">Last Login</p>
                  <p className="text-sm font-black text-slate-900 dark:text-white">{selectedUser?.lastActive}</p>
                </div>
              </div>
              <div className="flex items-center gap-3 text-slate-500">
                <History className="h-4 w-4" />
                <div>
                  <p className="text-[10px] uppercase font-bold tracking-widest opacity-50">System Status</p>
                  <p className={`text-sm font-black ${selectedUser?.status === 'Active' ? 'text-emerald-500' : 'text-rose-500'}`}>
                    {selectedUser?.status}
                  </p>
                </div>
              </div>
            </div>
          </div>
          <div className="p-8 border-t border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50 flex justify-end">
            <Button onClick={() => setIsProfileDialogOpen(false)} className="rounded-xl font-bold px-8">Close Profile</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Send Notification Dialog */}
      <Dialog open={isNotifyDialogOpen} onOpenChange={setIsNotifyDialogOpen}>
        <DialogContent className="rounded-3xl border-slate-200 dark:border-slate-800 shadow-2xl">
          <DialogHeader>
            <DialogTitle className="text-2xl font-black flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-blue-500/10 flex items-center justify-center">
                <Send className="h-5 w-5 text-blue-500" />
              </div>
              Send System Notification
            </DialogTitle>
            <DialogDescription className="text-slate-500 dark:text-slate-400 font-medium pt-2">
              Deliver an urgent message to <span className="font-bold text-slate-900 dark:text-white">{selectedUser?.name}</span>. This will appear in their dashboard notifications.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4 space-y-4">
            <div className="space-y-2">
              <label className="text-[10px] uppercase font-bold tracking-widest text-slate-400">Notification Message</label>
              <Textarea 
                placeholder="Enter your message here..." 
                className="min-h-[120px] rounded-2xl border-2 focus-visible:ring-blue-500 font-medium p-4"
                value={notifyMessage}
                onChange={(e) => setNotifyMessage(e.target.value)}
              />
            </div>
            <div className="flex items-center gap-2 p-3 bg-blue-50 dark:bg-blue-500/10 rounded-xl border border-blue-100 dark:border-blue-500/20 text-blue-600">
              <Briefcase className="h-4 w-4 shrink-0" />
              <p className="text-xs font-bold">This message will be logged as an official administrative action.</p>
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setIsNotifyDialogOpen(false)} className="rounded-xl border-2 font-bold h-12">Discard</Button>
            <Button 
              onClick={handleSendNotification}
              className="rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold h-12 shadow-lg shadow-blue-600/20 px-8"
              disabled={isProcessing || !notifyMessage}
            >
              {isProcessing ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Send className="h-4 w-4 mr-2" />}
              Send Message
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
