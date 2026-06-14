"use client";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { BroadcastsTab } from "@/components/admin/views/broadcasts-tab";
import { FeedbackTab } from "@/components/admin/views/feedback-tab";
import { MailsTab } from "@/components/admin/views/mails-tab";
import { MessageSquare, Radio, Mail, MessageCircle } from "lucide-react";

export default function CommunicationsPage() {
  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black tracking-tight flex items-center gap-2">
            <MessageSquare className="h-8 w-8 text-indigo-500" />
            Communications Hub
          </h1>
          <p className="text-muted-foreground mt-1">
            Manage global broadcasts, direct emails, and incoming user feedback.
          </p>
        </div>
      </div>

      <Tabs defaultValue="broadcasts" className="w-full">
        <TabsList className="mb-4 bg-slate-100 dark:bg-slate-900 w-full justify-start overflow-x-auto overflow-y-hidden flex-nowrap scrollbar-hide p-1 h-auto">
          <TabsTrigger value="broadcasts" className="flex items-center gap-2">
            <Radio className="h-4 w-4" />
            In-App Broadcasts
          </TabsTrigger>
          <TabsTrigger value="mails" className="flex items-center gap-2">
            <Mail className="h-4 w-4" />
            Email Campaigns
          </TabsTrigger>
          <TabsTrigger value="feedback" className="flex items-center gap-2">
            <MessageCircle className="h-4 w-4" />
            User Feedback
          </TabsTrigger>
        </TabsList>

        <TabsContent value="broadcasts" className="focus-visible:outline-none focus-visible:ring-0">
          <BroadcastsTab />
        </TabsContent>

        <TabsContent value="mails" className="focus-visible:outline-none focus-visible:ring-0">
          <MailsTab />
        </TabsContent>

        <TabsContent value="feedback" className="focus-visible:outline-none focus-visible:ring-0">
          <FeedbackTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
