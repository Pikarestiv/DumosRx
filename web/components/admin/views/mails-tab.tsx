"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  CardFooter,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2, Mail, Send } from "lucide-react";
import { toast } from "sonner";
import { useMutation, useQuery } from "@tanstack/react-query";
import { webApiClient } from "@/lib/api/client";
import { UserSelector } from "@/components/admin/user-selector";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useAdminAuthStore, checkIsSuperAdmin } from "@/lib/store/use-admin-auth-store";
import type { AdminUser } from "@/lib/types/admin";

const AUDIENCES = [
  { value: "all", label: "Everyone with an email", noun: "every user with a deliverable email" },
  { value: "store_owners", label: "Store owners only", noun: "every store owner" },
  { value: "staff", label: "Store staff only", noun: "every staff member with a real email" },
  { value: "platform_admins", label: "Platform admins and agents", noun: "the platform team" },
  { value: "specific", label: "Specific users", noun: "the selected users" },
] as const;

type Audience = (typeof AUDIENCES)[number]["value"];

export function MailsTab() {
  const { user } = useAdminAuthStore();
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [isHtml, setIsHtml] = useState(false);
  const [targetType, setTargetType] = useState<Audience>("all");
  const [selectedUsers, setSelectedUsers] = useState<AdminUser[]>([]);
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);

  const audience = AUDIENCES.find((a) => a.value === targetType) ?? AUDIENCES[0];

  const { data: recipients } = useQuery({
    queryKey: ["admin-mail-recipient-count", targetType],
    queryFn: () => webApiClient.request<{ count: number }>(`admin/mail/recipient-count?target_type=${targetType}`),
    enabled: targetType !== "specific",
  });
  const recipientLabel =
    recipients === undefined ? audience.noun : `${recipients.count} recipient${recipients.count === 1 ? "" : "s"} (${audience.noun})`;

  const sendMailMutation = useMutation({
    mutationFn: (data: Record<string, unknown>) =>
      webApiClient.request("admin/mail/send", { method: "POST", data }),
    onSuccess: () => {
      toast.success("Email(s) dispatched successfully!");
      setSubject("");
      setMessage("");
      setSelectedUsers([]);
    },
    onError: (error) => {
      toast.error(error.message || "Failed to send emails");
    },
  });

  const handleSendMail = (e: React.FormEvent) => {
    e.preventDefault();
    if (!subject || !message) {
      toast.error("Please provide both a subject and a message.");
      return;
    }
    if (targetType === "specific" && selectedUsers.length === 0) {
      toast.error("Please select at least one user to email.");
      return;
    }

    if (targetType !== "specific") {
      setIsConfirmOpen(true);
      return;
    }

    dispatchMail();
  };

  const dispatchMail = () => {
    sendMailMutation.mutate({
      subject,
      message,
      target_type: targetType,
      is_html: isHtml,
      user_ids: selectedUsers.map((u) => u.id),
    });
  };

  if (!checkIsSuperAdmin(user?.role)) return null;

  return (
    <Card className="bg-white/50 dark:bg-slate-900/50 backdrop-blur-sm border-slate-200 dark:border-slate-800 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Mail className="h-5 w-5 text-indigo-500" />
          Send Email Campaign
        </CardTitle>
        <CardDescription>
          Compose and send emails to specific users or broadcast to your entire
          user base.
        </CardDescription>
      </CardHeader>
      <form onSubmit={handleSendMail}>
        <CardContent className="space-y-6">
          <div className="space-y-2">
            <Label>Target Audience</Label>
            <Select value={targetType} onValueChange={(v) => setTargetType(v as Audience)}>
              <SelectTrigger className="w-full sm:w-72">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {AUDIENCES.map((a) => (
                  <SelectItem key={a.value} value={a.value}>
                    {a.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {targetType === "specific" && (
            <UserSelector
              selectedUsers={selectedUsers}
              onUsersChange={setSelectedUsers}
              hideTargetToggle
            />
          )}

          {targetType !== "specific" && (
            <p className="text-sm font-medium text-amber-600 dark:text-amber-400">
              This will email {recipientLabel}. You&apos;ll be asked to confirm before it sends.
            </p>
          )}

          <div className="space-y-4 pt-4 border-t border-slate-100 dark:border-slate-800">
            <div className="space-y-2">
              <Label htmlFor="subject">Email Subject</Label>
              <Input
                id="subject"
                placeholder="Important account update..."
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="message">Message Body</Label>
                <div className="flex items-center gap-2">
                  <Label htmlFor="is-html" className="text-sm font-normal">
                    Send as HTML
                  </Label>
                  <Switch id="is-html" checked={isHtml} onCheckedChange={setIsHtml} />
                </div>
              </div>
              <Textarea
                id="message"
                placeholder={isHtml ? "<p>Write your HTML here...</p>" : "Write your email content here..."}
                className={`min-h-[200px] ${isHtml ? "font-mono text-xs" : ""}`}
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                required
              />
            </div>
          </div>
        </CardContent>
        <CardFooter className="flex justify-end border-t border-slate-100 dark:border-slate-800 pt-6">
          <Button
            type="submit"
            className="bg-indigo-600 hover:bg-indigo-700 font-bold px-8 shadow-lg shadow-indigo-600/20"
            disabled={sendMailMutation.isPending}
          >
            {sendMailMutation.isPending ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Send className="mr-2 h-4 w-4" />
            )}
            Send Email
          </Button>
        </CardFooter>
      </form>

      <ConfirmDialog
        open={isConfirmOpen}
        onOpenChange={setIsConfirmOpen}
        title={`Email ${audience.label.toLowerCase()}?`}
        description={`This sends "${subject}" to ${recipientLabel}. This cannot be undone.`}
        confirmLabel="Send now"
        onConfirm={dispatchMail}
      />
    </Card>
  );
}
