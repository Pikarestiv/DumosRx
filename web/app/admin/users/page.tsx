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
  ShieldAlert
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
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Card, CardContent } from "@/components/ui/card";
import { useAdminStore } from "@/lib/store/use-admin-store";
import { useDebounce } from "@/hooks/use-debounce";

export default function GlobalUsersDirectory() {
  const { users, userMeta, loading, error, fetchUsers } = useAdminStore();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
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

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-4xl font-black tracking-tight text-slate-900 dark:text-white">Platform Users</h1>
          <p className="text-slate-500 dark:text-slate-400 mt-1 font-medium">Monitor and manage all users across the platform ecosystem</p>
        </div>
        <div className="flex items-center gap-3">
            <Button variant="outline" className="border-2 font-bold dark:bg-slate-900 dark:border-slate-800">
                <Download className="h-4 w-4 mr-2" />
                Export User List
            </Button>
            <Button className="bg-indigo-600 hover:bg-indigo-700 font-bold shadow-lg shadow-indigo-600/20">
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
                <Button variant="outline" size="sm" className="font-bold border-2">
                    <Filter className="h-4 w-4 mr-2" />
                    Roles
                </Button>
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
                              <span className="text-[9px] text-slate-400 uppercase tracking-widest font-medium">May 13, 2026</span>
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
                          <DropdownMenuContent align="end" className="w-56 p-2">
                            <DropdownMenuLabel>User Actions</DropdownMenuLabel>
                            <DropdownMenuItem className="cursor-pointer gap-2 py-2">
                              <Eye className="h-4 w-4 text-indigo-500" />
                              <span>View Detailed Profile</span>
                            </DropdownMenuItem>
                            <DropdownMenuItem className="cursor-pointer gap-2 py-2">
                              <Mail className="h-4 w-4 text-blue-500" />
                              <span>Send Notification</span>
                            </DropdownMenuItem>
                            <DropdownMenuItem className="cursor-pointer gap-2 py-2">
                              <Lock className="h-4 w-4 text-amber-500" />
                              <span>Force Password Reset</span>
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem className="cursor-pointer gap-2 py-2 text-rose-600 focus:text-rose-600 focus:bg-rose-50 dark:focus:bg-rose-500/10">
                              <Ban className="h-4 w-4" />
                              <span>Deactivate Account</span>
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

          {userMeta && (
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
    </div>
  );
}
