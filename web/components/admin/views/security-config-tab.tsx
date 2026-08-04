"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Save, RefreshCw, Loader2, ShieldCheck, MailWarning } from "lucide-react";
import { toast } from "sonner";
import { useSystemConfig, useUpdateSystemConfigMutation } from "@/lib/api/hooks";

export function SecurityConfigTab() {
  const { data: serverConfig, isLoading } = useSystemConfig("require_email_verification");
  const updateMutation = useUpdateSystemConfigMutation();

  const [requireVerification, setRequireVerification] = useState(false);

  useEffect(() => {
    if (serverConfig !== undefined && serverConfig !== null) {
      setRequireVerification(Boolean(serverConfig));
    }
  }, [serverConfig]);

  const handleSave = async () => {
    try {
      await updateMutation.mutateAsync({ key: "require_email_verification", value: requireVerification });
      toast.success("Security configuration saved successfully!");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to save configuration");
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-12">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Card className="bg-white dark:bg-slate-900 border-accent/20">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-indigo-500" />
            Security & Authentication
          </CardTitle>
          <CardDescription>
            Manage global security policies and authentication requirements.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex flex-row items-center justify-between rounded-lg border p-4">
            <div className="space-y-0.5">
              <Label className="text-base flex items-center gap-2">
                <MailWarning className="h-4 w-4 text-amber-500" />
                Require Email Verification
              </Label>
              <div className="text-sm text-muted-foreground">
                When enabled, newly registered users must verify their email address before they can sync the local POS app or perform sensitive actions on the dashboard.
              </div>
            </div>
            <Switch
              checked={requireVerification}
              onCheckedChange={setRequireVerification}
            />
          </div>
        </CardContent>
        <CardFooter className="bg-slate-50 dark:bg-slate-800/50 p-4 border-t flex justify-end">
          <Button onClick={handleSave} disabled={updateMutation.isPending} className="bg-indigo-600 hover:bg-indigo-700">
            {updateMutation.isPending ? <RefreshCw className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
            Save Configuration
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}
