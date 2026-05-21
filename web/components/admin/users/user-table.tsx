import { 
  ShieldAlert, 
  Shield, 
  Store, 
  MoreVertical, 
  Eye, 
  Mail, 
  Lock, 
  Ban 
} from "lucide-react";
import { Button } from "@/components/ui/button";
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

interface UserTableProps {
  userList: any[];
  isLoading: boolean;
  error: any;
  refetch: () => void;
  setSelectedUser: (user: any) => void;
  setIsProfileDialogOpen: (val: boolean) => void;
  setIsNotifyDialogOpen: (val: boolean) => void;
  setIsResetDialogOpen: (val: boolean) => void;
  setIsDeactivateDialogOpen: (val: boolean) => void;
}

export function UserTable({
  userList,
  isLoading,
  error,
  refetch,
  setSelectedUser,
  setIsProfileDialogOpen,
  setIsNotifyDialogOpen,
  setIsResetDialogOpen,
  setIsDeactivateDialogOpen
}: UserTableProps) {
  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-4">
        <ShieldAlert className="h-10 w-10 text-rose-500" />
        <p className="text-rose-500 font-bold">{error instanceof Error ? error.message : "Sync error"}</p>
        <Button onClick={() => refetch()} variant="outline">Retry</Button>
      </div>
    );
  }

  return (
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
        {userList.length === 0 && !isLoading && (
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
  );
}
