"use client";

import { useState } from "react";
import { ResponsiveModal } from "@/components/ui/responsive-modal";
import { DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { useSubmitFeedbackMutation } from "@/lib/hooks/use-submit-feedback-mutation";
import { useAuth } from "@/lib/context/auth-context";
import { MessageSquare, Bug, Lightbulb, MessageCircle } from "lucide-react";

interface FeedbackFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function FeedbackForm({ open, onOpenChange }: FeedbackFormProps) {
  const { user } = useAuth();
  const [type, setType] = useState("bug");
  const [content, setContent] = useState("");
  const [email, setEmail] = useState(() => {
    const username = user?.username || "";
    return username.charAt(0).toUpperCase() + username.slice(1);
  });
  const submitFeedbackMutation = useSubmitFeedbackMutation();
  const isSubmitting = submitFeedbackMutation.isPending;

  const handleSubmit = () => {
    if (!content.trim()) {
      toast.error("Please provide some feedback details");
      return;
    }
    if (isSubmitting) return;

    submitFeedbackMutation.mutate(
      { userId: user?.id || "anonymous", type, content, email },
      {
        onSuccess: () => {
          toast.success(
            "Thank you for your feedback! It has been saved locally and will sync when online.",
          );
          setContent("");
          onOpenChange(false);
        },
        onError: (error) => {
          console.error("Feedback error:", error);
          toast.error("Failed to save feedback");
        },
      },
    );
  };

  return (
    <ResponsiveModal
      open={open}
      // className="sm:max-w-[440px] p-0 overflow-hidden bg-card rounded-2xl gap-0 border-border shadow-lg"
      headerClassName="pt-0 pb-5 gap-3 m-0"
      onOpenChange={onOpenChange}
      title={
        <span className="flex items-center justify-start sm:justify-start gap-3">
          <MessageSquare className="h-5 w-5 text-primary shrink-0" />
          Send Feedback
        </span>
      }
      description={
        <>
          Help improve {process.env.NEXT_PUBLIC_APP_NAME || "DumosRx"}. Report a
          bug, suggest a feature, or just say hello.
        </>
      }
      className="sm:max-w-[500px]"
      footer={
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isSubmitting}
          >
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={isSubmitting}>
            {isSubmitting ? "Sending..." : "Submit Feedback"}
          </Button>
        </DialogFooter>
      }
    >
      <div className="space-y-4 pb-4">
        <div className="space-y-2">
          <Label htmlFor="feedback-type">What kind of feedback?</Label>
          <Select value={type} onValueChange={setType}>
            <SelectTrigger
              id="feedback-type"
              className="w-full outline outline-border focus:outline-1 focus:outline-border"
            >
              <SelectValue placeholder="Select type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="bug">
                <div className="flex items-center gap-2">
                  <Bug className="h-4 w-4 text-destructive" />
                  <span>Bug Report</span>
                </div>
              </SelectItem>
              <SelectItem value="feature_request">
                <div className="flex items-center gap-2">
                  <Lightbulb className="h-4 w-4 text-amber-500" />
                  <span>Feature Request</span>
                </div>
              </SelectItem>
              <SelectItem value="other">
                <div className="flex items-center gap-2">
                  <MessageCircle className="h-4 w-4 text-blue-500" />
                  <span>General Feedback</span>
                </div>
              </SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="feedback-content">Details</Label>
          <Textarea
            id="feedback-content"
            placeholder={
              type === "bug"
                ? "Describe what happened and how to reproduce it..."
                : type === "feature_request"
                  ? "What new feature would you like to see?"
                  : "Tell us what's on your mind..."
            }
            className="min-h-[120px] border border-border outline-1 outline-border focus:outline-1 focus:outline-border"
            value={content}
            onChange={(e) => setContent(e.target.value)}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="contact-email">Contact Email / Username</Label>
          <Input
            id="contact-email"
            type="text"
            placeholder="How can we reach you?"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="outline outline-border focus:outline-1 focus:outline-border"
          />
        </div>
      </div>
    </ResponsiveModal>
  );
}
