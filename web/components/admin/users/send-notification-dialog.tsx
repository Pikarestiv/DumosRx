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
  Briefcase,
  Trash2
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
import { BaseDialogProps } from "./dialog-types";

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
