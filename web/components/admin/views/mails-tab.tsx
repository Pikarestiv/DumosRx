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
import { Loader2, Mail, Send } from "lucide-react";
import { toast } from "sonner";
import { useMutation } from "@tanstack/react-query";
import { webApiClient } from "@/lib/api/client";
import { UserSelector } from "@/components/admin/user-selector";

export function MailsTab() {
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [targetType, setTargetType] = useState<"all" | "specific">("all");
  const [selectedUsers, setSelectedUsers] = useState<any[]>([]);

  const sendMailMutation = useMutation({
    mutationFn: (data: any) =>
      webApiClient.request("admin/mail/send", { method: "POST", data }),
    onSuccess: () => {
      toast.success("Email(s) dispatched successfully!");
      setSubject("");
      setMessage("");
      setSelectedUsers([]);
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.message || "Failed to send emails");
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

    sendMailMutation.mutate({
      subject,
      message,
      target_type: targetType,
      user_ids: selectedUsers.map((u) => u.id),
    });
  };

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
          <UserSelector
            selectedUsers={selectedUsers}
            onUsersChange={setSelectedUsers}
            targetType={targetType}
            onTargetTypeChange={setTargetType}
          />

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
              <Label htmlFor="message">Message Body</Label>
              <Textarea
                id="message"
                placeholder="Write your email content here..."
                className="min-h-[200px]"
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
    </Card>
  );
}
