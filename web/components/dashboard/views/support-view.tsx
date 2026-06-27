import { SmartSuppProvider } from "@/components/smartsupp-provider";
import { MessageSquarePlus } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export function SupportView() {
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
            If you need assistance, feature requests, or want to report a bug, use the chat widget located at the bottom right corner of this screen. Our team will get back to you as soon as possible.
          </p>
          <SmartSuppProvider />
        </CardContent>
      </Card>
    </div>
  );
}
