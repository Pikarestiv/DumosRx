"use client";

import { useState } from "react";
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle, 
  DialogDescription,
  DialogFooter
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from "@/components/ui/select";
import { toast } from "sonner";
import { insert } from "@/lib/db/local-database";
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
  const [email, setEmail] = useState(user?.username || "");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (!content.trim()) {
      toast.error("Please provide some feedback details");
      return;
    }

    setIsSubmitting(true);
    try {
      await insert("feedback", {
        id: crypto.randomUUID(),
        user_id: user?.id || "anonymous",
        type,
        content,
        contact_email: email,
        status: "pending",
        created_at: new Date().toISOString(),
        _synced: 0
      });

      toast.success("Thank you for your feedback! It has been saved locally and will sync when online.");
      setContent("");
      onOpenChange(false);
    } catch (error) {
      console.error("Feedback error:", error);
      toast.error("Failed to save feedback");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 font-serif text-2xl">
            <MessageSquare className="h-6 w-6 text-primary" />
            Send Feedback
          </DialogTitle>
          <DialogDescription>
            Help us improve {process.env.NEXT_PUBLIC_APP_NAME || "DumosRx"}. Tell us about a bug, suggest a feature, or just say hello!
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="feedback-type">What kind of feedback?</Label>
            <Select value={type} onValueChange={setType}>
              <SelectTrigger id="feedback-type" className="w-full">
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
              className="min-h-[120px]"
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
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={isSubmitting}>
            {isSubmitting ? "Sending..." : "Submit Feedback"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
