import { useState } from "react";
import { 
  Send, 
  Shield, 
  Lock, 
  Store, 
  Ban, 
  Loader2,
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
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { toast } from "sonner";

interface BaseDialogProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  selectedUser: any;
  setSelectedUser: (user: any) => void;
}

export function DeactivateUserDialog({
  isOpen,
  onOpenChange,
  selectedUser,
  setSelectedUser,
  deactivateMutation,
}: BaseDialogProps & { deactivateMutation: any }) {
  const handleDeactivate = async () => {
    if (!selectedUser) return;
    deactivateMutation.mutate(selectedUser.id, {
      onSuccess: () => {
        toast.success("Account Deactivated", {
          description: `${selectedUser.name}'s account has been disabled.`
        });
        onOpenChange(false);
        setSelectedUser(null);
      },
      onError: (err: any) => {
        toast.error("Action Failed", { description: err.message || "Failed to deactivate user" });
      }
    });
  };

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
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
          <Button variant="outline" onClick={() => onOpenChange(false)} className="rounded-xl border-2 font-bold h-12">Cancel</Button>
          <Button 
            onClick={handleDeactivate}
            className="rounded-xl bg-rose-500 hover:bg-rose-600 text-white font-bold h-12 shadow-lg shadow-rose-500/20"
            disabled={deactivateMutation.isPending}
          >
            {deactivateMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
            Deactivate Account
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function ResetPasswordDialog({
  isOpen,
  onOpenChange,
  selectedUser,
  setSelectedUser,
  resetPasswordMutation,
}: BaseDialogProps & { resetPasswordMutation: any }) {
  const handlePasswordReset = async () => {
    if (!selectedUser) return;
    resetPasswordMutation.mutate(selectedUser.id, {
      onSuccess: (res: any) => {
        toast.success("Password Reset Forced", {
          description: `Temporary password: ${res.temp_password}. Please communicate this to the user.`
        });
        onOpenChange(false);
        setSelectedUser(null);
      },
      onError: (err: any) => {
        toast.error("Action Failed", { description: err.message || "Failed to force password reset" });
      }
    });
  };

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
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
          <Button variant="outline" onClick={() => onOpenChange(false)} className="rounded-xl border-2 font-bold h-12">Cancel</Button>
          <Button 
            onClick={handlePasswordReset}
            className="rounded-xl bg-amber-500 hover:bg-amber-600 text-white font-bold h-12 shadow-lg shadow-amber-500/20"
            disabled={resetPasswordMutation.isPending}
          >
            {resetPasswordMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
            Confirm Reset
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function UserProfileDialog({
  isOpen,
  onOpenChange,
  selectedUser,
}: Omit<BaseDialogProps, 'setSelectedUser'>) {
  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl rounded-3xl border-slate-200 dark:border-slate-800 shadow-2xl p-0 overflow-hidden">
        <DialogHeader className="sr-only">
          <DialogTitle>User Detailed Profile</DialogTitle>
          <DialogDescription>View detailed user profile information</DialogDescription>
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
          <Button onClick={() => onOpenChange(false)} className="rounded-xl font-bold px-8">Close Profile</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function SendNotificationDialog({
  isOpen,
  onOpenChange,
  selectedUser,
  setSelectedUser,
  notifyMutation,
}: BaseDialogProps & { notifyMutation: any }) {
  const [notifyTitle, setNotifyTitle] = useState("Administrative Message");
  const [notifyMessage, setNotifyMessage] = useState("");

  const handleSendNotification = async () => {
    if (!selectedUser || !notifyMessage || !notifyTitle) return;
    notifyMutation.mutate({ 
      id: selectedUser.id, 
      payload: {
        title: notifyTitle, 
        message: notifyMessage 
      }
    }, {
      onSuccess: () => {
        toast.success("Notification Sent", {
          description: `Message successfully delivered to ${selectedUser.name}`
        });
        setNotifyMessage("");
        setNotifyTitle("Administrative Message");
        onOpenChange(false);
        setSelectedUser(null);
      },
      onError: (err: any) => {
        toast.error("Failed to Send", { description: err.message });
      }
    });
  };

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
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
            <label className="text-[10px] uppercase font-bold tracking-widest text-slate-400">Subject / Title</label>
            <Input 
              placeholder="Enter notification title..." 
              className="rounded-xl border-2 focus-visible:ring-blue-500 font-bold"
              value={notifyTitle}
              onChange={(e) => setNotifyTitle(e.target.value)}
            />
          </div>
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
          <Button variant="outline" onClick={() => onOpenChange(false)} className="rounded-xl border-2 font-bold h-12">Discard</Button>
          <Button 
            onClick={handleSendNotification}
            className="rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold h-12 shadow-lg shadow-blue-600/20 px-8"
            disabled={notifyMutation.isPending || !notifyMessage}
          >
            {notifyMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Send className="h-4 w-4 mr-2" />}
            Send Message
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
