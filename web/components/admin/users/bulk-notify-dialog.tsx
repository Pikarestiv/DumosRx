import { useState } from "react";
import { Send, Loader2, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import type { useBulkNotifyUsersMutation } from "@/lib/api/admin-hooks";

interface BulkNotifyDialogProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  /** Recipient count as currently filtered on the Users list, shown so the
   * admin knows who "All" means before sending. */
  recipientCount: number;
  /** Same role/search filters currently applied to the list, forwarded to
   * AdminService::bulkNotify so the send only reaches the filtered set
   * rather than silently notifying every user on the platform. */
  filters: { role?: string; search?: string };
  bulkNotifyMutation: ReturnType<typeof useBulkNotifyUsersMutation>;
}

export function BulkNotifyDialog({
  isOpen,
  onOpenChange,
  recipientCount,
  filters,
  bulkNotifyMutation,
}: BulkNotifyDialogProps) {
  const [title, setTitle] = useState("Administrative Message");
  const [message, setMessage] = useState("");

  const handleSend = () => {
    if (!title || !message) return;
    bulkNotifyMutation.mutate(
      { title, message, filters },
      {
        onSuccess: (data) => {
          toast.success("Notifications Sent", {
            description: data?.message || `Notified ${data?.count ?? recipientCount} users.`,
          });
          setMessage("");
          setTitle("Administrative Message");
          onOpenChange(false);
        },
        onError: (err) => {
          toast.error("Failed to Send", { description: err.message });
        },
      },
    );
  };

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="rounded-3xl border-slate-200 dark:border-slate-800 shadow-2xl">
        <DialogHeader>
          <DialogTitle className="text-2xl font-black flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-indigo-500/10 flex items-center justify-center">
              <Users className="h-5 w-5 text-indigo-500" />
            </div>
            Notify All Filtered Users
          </DialogTitle>
          <DialogDescription className="text-slate-500 dark:text-slate-400 font-medium pt-2">
            Deliver a message to{" "}
            <span className="font-bold text-slate-900 dark:text-white">
              {recipientCount} user{recipientCount === 1 ? "" : "s"}
            </span>{" "}
            matching the current search/role filters. This will appear in each
            recipient&apos;s dashboard notifications and be emailed to them.
          </DialogDescription>
        </DialogHeader>
        <div className="py-4 space-y-4">
          <div className="space-y-2">
            <label className="text-[10px] uppercase font-bold tracking-widest text-slate-400">
              Subject / Title
            </label>
            <Input
              placeholder="Enter notification title..."
              className="rounded-xl border-2 focus-visible:ring-indigo-500 font-bold"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <label className="text-[10px] uppercase font-bold tracking-widest text-slate-400">
              Notification Message
            </label>
            <Textarea
              placeholder="Enter your message here..."
              className="min-h-[120px] rounded-2xl border-2 focus-visible:ring-indigo-500 font-medium p-4"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
            />
          </div>
        </div>
        <DialogFooter className="gap-2">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            className="rounded-xl border-2 font-bold h-12"
          >
            Discard
          </Button>
          <Button
            onClick={handleSend}
            className="rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold h-12 shadow-lg shadow-indigo-600/20 px-8"
            disabled={bulkNotifyMutation.isPending || !message || !title}
          >
            {bulkNotifyMutation.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
            ) : (
              <Send className="h-4 w-4 mr-2" />
            )}
            Send to All
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
