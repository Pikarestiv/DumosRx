"use client";

import { useState } from "react";
import {
  Video,
  ExternalLink,
  Sparkles,
  Mail,
  MessageSquare,
  Clock,
  Send,
  HelpCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { useAuth } from "@/lib/context/auth-context";
import { useSubmitFeedbackMutation } from "@/lib/hooks/use-submit-feedback-mutation";
import { useAssistantPanel } from "@/lib/store/use-assistant-panel";
import { GUIDES_URL, SUPPORT_EMAIL } from "@/lib/constants";

export function HelpPage() {
  const { user } = useAuth();
  const [feedbackType, setFeedbackType] = useState<string>("bug");
  const [feedbackContent, setFeedbackContent] = useState("");
  const submitFeedbackMutation = useSubmitFeedbackMutation();
  const isSubmitting = submitFeedbackMutation.isPending;

  const handleOpenGuides = () => {
    window.open(GUIDES_URL, "_blank", "noopener,noreferrer");
  };

  const handleOpenAssistant = () => {
    useAssistantPanel.getState().open();
  };

  const handleSubmitFeedback = (e: React.FormEvent) => {
    e.preventDefault();
    if (!feedbackContent.trim()) {
      toast.error("Please provide some feedback details");
      return;
    }
    if (isSubmitting) return;

    const email = user?.username
      ? user.username.charAt(0).toUpperCase() + user.username.slice(1)
      : "Store User";

    submitFeedbackMutation.mutate(
      {
        userId: user?.id || "anonymous",
        type: feedbackType,
        content: feedbackContent.trim(),
        email,
      },
      {
        onSuccess: () => {
          toast.success("Thank you for your feedback! It will sync automatically.");
          setFeedbackContent("");
        },
        onError: () => {
          toast.error("Failed to save feedback");
        },
      },
    );
  };

  return (
    <div className="flex-1 space-y-8 p-4 md:p-8 max-w-6xl mx-auto">
      {/* Header */}
      <div>
        <div className="flex items-center gap-2 text-primary font-semibold text-xs tracking-wider uppercase mb-1">
          <HelpCircle className="h-4 w-4" />
          <span>Support & Resources</span>
        </div>
        <h1 className="text-3xl font-bold tracking-tight text-foreground font-serif">
          Help & Support Hub
        </h1>
        <p className="text-muted-foreground text-sm mt-1">
          Video tutorials, user guides, offline assistant, and direct support.
        </p>
      </div>

      {/* Featured Card: Video Tutorials & Knowledgebase */}
      <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm p-6 sm:p-8 relative overflow-hidden">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-3 max-w-2xl">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800/60">
              <Video className="h-3.5 w-3.5" />
              <span>Online Video Tutorials & Knowledgebase</span>
            </div>
            <h2 className="text-2xl font-bold tracking-tight text-foreground font-serif">
              Step-by-Step Feature Walkthroughs & Videos
            </h2>
            <p className="text-muted-foreground text-sm leading-relaxed">
              Browse 21 concise guides with video walkthroughs covering POS Spot Sourcing,
              selling without stock, inter-branch transfers, instant till relinking, cycle counts,
              and daily closing. Opens in an external browser tab so your active register session stays open.
            </p>
          </div>
          <div className="shrink-0">
            <Button
              size="lg"
              onClick={handleOpenGuides}
              className="w-full sm:w-auto gap-2 bg-primary text-primary-foreground font-medium shadow-md hover:bg-primary/90"
            >
              <span>Watch Video Guides</span>
              <ExternalLink className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>

      {/* Two Column Section: Assistant & Direct Support */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Offline Assistant Card */}
        <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm p-6 sm:p-8 flex flex-col justify-between">
          <div className="space-y-3">
            <div className="h-10 w-10 rounded-2xl bg-primary/10 text-primary flex items-center justify-center">
              <Sparkles className="h-5 w-5" />
            </div>
            <h3 className="text-xl font-bold text-foreground font-serif">
              Ask Dumos Assistant
            </h3>
            <p className="text-muted-foreground text-sm leading-relaxed">
              Get instant step-by-step help offline. Ask questions about your sales, stock balances,
              low-stock alerts, or how to perform any task in the app without an internet connection.
            </p>
          </div>
          <div className="pt-6">
            <Button
              variant="outline"
              onClick={handleOpenAssistant}
              className="w-full sm:w-auto gap-2"
            >
              <Sparkles className="h-4 w-4 text-primary" />
              <span>Launch Assistant</span>
            </Button>
          </div>
        </div>

        {/* Dedicated Support Card */}
        <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm p-6 sm:p-8 flex flex-col justify-between">
          <div className="space-y-3">
            <div className="h-10 w-10 rounded-2xl bg-amber-500/10 text-amber-600 dark:text-amber-400 flex items-center justify-center">
              <Mail className="h-5 w-5" />
            </div>
            <h3 className="text-xl font-bold text-foreground font-serif">
              Account Manager & CRM
            </h3>
            <p className="text-muted-foreground text-sm leading-relaxed">
              Need direct help with your pharmacy account, subscription, hardware setup,
              or till reconnection? Contact our team directly:
            </p>
            <div className="space-y-2 pt-1 text-sm text-foreground">
              <div className="flex items-center gap-2">
                <Mail className="h-4 w-4 text-muted-foreground shrink-0" />
                <span className="font-mono text-xs sm:text-sm">{SUPPORT_EMAIL}</span>
              </div>
              <div className="flex items-center gap-2">
                <Clock className="h-4 w-4 text-muted-foreground shrink-0" />
                <span className="text-xs sm:text-sm text-muted-foreground">Mon - Sat (8:00 AM - 8:00 PM WAT)</span>
              </div>
            </div>
          </div>
          <div className="pt-6">
            <p className="text-xs text-muted-foreground">
              You can also message your dedicated CRM onboarding agent directly on WhatsApp.
            </p>
          </div>
        </div>
      </div>

      {/* Embedded Feedback Form */}
      <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm p-6 sm:p-8">
        <div className="flex items-center gap-2 text-primary font-semibold text-xs tracking-wider uppercase mb-1">
          <MessageSquare className="h-4 w-4" />
          <span>Feedback & Bug Reports</span>
        </div>
        <h3 className="text-xl font-bold text-foreground font-serif">
          Send Feedback or Report an Issue
        </h3>
        <p className="text-muted-foreground text-sm mt-1">
          Encountered a problem or have an idea to improve DumosRx? Submit your notes here.
          They are saved locally and sync to the cloud automatically.
        </p>

        <form onSubmit={handleSubmitFeedback} className="space-y-4 mt-6">
          <div className="space-y-2">
            <Label htmlFor="feedback-type">What kind of feedback?</Label>
            <Select value={feedbackType} onValueChange={setFeedbackType}>
              <SelectTrigger id="feedback-type" className="max-w-xs">
                <SelectValue placeholder="Select feedback type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="bug">Report a Bug / Issue</SelectItem>
                <SelectItem value="feature">Suggest a Feature</SelectItem>
                <SelectItem value="general">General Feedback / Comment</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="feedback-content">Details</Label>
            <Textarea
              id="feedback-content"
              value={feedbackContent}
              onChange={(e) => setFeedbackContent(e.target.value)}
              placeholder="Tell us what happened, or what you would like to see..."
              rows={4}
              className="resize-none"
            />
          </div>

          <div className="flex justify-end pt-2">
            <Button type="submit" disabled={isSubmitting} className="gap-2">
              <Send className="h-4 w-4" />
              <span>{isSubmitting ? "Submitting..." : "Submit Feedback"}</span>
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

