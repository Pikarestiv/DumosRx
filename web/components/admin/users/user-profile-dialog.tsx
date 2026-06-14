import { Shield, Store, Calendar, Activity, History } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { BaseDialogProps } from "./dialog-types";

export function UserProfileDialog({
  isOpen,
  onOpenChange,
  selectedUser,
}: Omit<BaseDialogProps, "setSelectedUser">) {
  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl rounded-3xl border-slate-200 dark:border-slate-800 shadow-2xl p-0 overflow-hidden">
        <DialogHeader className="sr-only">
          <DialogTitle>User Detailed Profile</DialogTitle>
          <DialogDescription>
            View detailed user profile information
          </DialogDescription>
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
                <p className="text-[10px] uppercase font-bold tracking-widest opacity-50">
                  Affiliated Store
                </p>
                <p className="text-sm font-black text-slate-900 dark:text-white">
                  {selectedUser?.store}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3 text-slate-500">
              <Calendar className="h-4 w-4" />
              <div>
                <p className="text-[10px] uppercase font-bold tracking-widest opacity-50">
                  Member Since
                </p>
                <p className="text-sm font-black text-slate-900 dark:text-white">
                  {selectedUser?.joinedAt || "N/A"}
                </p>
              </div>
            </div>
          </div>
          <div className="space-y-4">
            <div className="flex items-center gap-3 text-slate-500">
              <Activity className="h-4 w-4" />
              <div>
                <p className="text-[10px] uppercase font-bold tracking-widest opacity-50">
                  Last Login
                </p>
                <p className="text-sm font-black text-slate-900 dark:text-white">
                  {selectedUser?.lastActive}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3 text-slate-500">
              <History className="h-4 w-4" />
              <div>
                <p className="text-[10px] uppercase font-bold tracking-widest opacity-50">
                  System Status
                </p>
                <p
                  className={`text-sm font-black ${selectedUser?.status === "Active" ? "text-emerald-500" : "text-rose-500"}`}
                >
                  {selectedUser?.status}
                </p>
              </div>
            </div>
          </div>
        </div>
        <div className="p-8 border-t border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50 flex justify-end">
          <Button
            onClick={() => onOpenChange(false)}
            className="rounded-xl font-bold px-8"
          >
            Close Profile
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
