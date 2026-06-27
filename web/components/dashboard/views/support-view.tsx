import { SmartSuppProvider } from "@/components/smartsupp-provider";
import { MessageSquarePlus, Lightbulb } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { FeedbackForm } from "@/components/feedback/feedback-form";
import { useState } from "react";

export function SupportView() {
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  return (
    <div className="space-y-6">
      <div className="flex justify-between items-start">
        <div>
          <h2 className="text-3xl font-black tracking-tight font-heading">Support & Help</h2>
          <p className="text-muted-foreground mt-2">Get help and talk with our support team.</p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <MessageSquarePlus className="h-5 w-5 text-primary" />
            <CardTitle>Live Chat</CardTitle>
          </div>
          <CardDescription>Talk directly with our support team in real-time.</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="mb-4">
            If you need assistance with your account, use the chat widget located at the bottom right corner of this screen. Our team will get back to you as soon as possible.
          </p>
          <SmartSuppProvider />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Lightbulb className="h-5 w-5 text-amber-500" />
            <CardTitle>Send Feedback</CardTitle>
          </div>
          <CardDescription>Found a bug or have a feature request?</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="mb-4 text-muted-foreground">
            Help us improve DumosRx. Tell us about a bug, suggest a feature, or just share your thoughts on the platform.
          </p>
          <Button onClick={() => setFeedbackOpen(true)} className="w-full sm:w-auto">
            Open Feedback Form
          </Button>
        </CardContent>
      </Card>

      <FeedbackForm open={feedbackOpen} onOpenChange={setFeedbackOpen} />
    </div>
  );
}
