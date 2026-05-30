"use client";

import { useState, useEffect } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Save, RefreshCw, MessageCircle, Loader2, ExternalLink, Eye, EyeOff } from "lucide-react";
import { toast } from "sonner";
import { useSystemConfig, useUpdateSystemConfigMutation } from "@/lib/api/hooks";

export function IntegrationsTab() {
  const { data: smartsuppKey, isLoading } = useSystemConfig("smartsupp_key");
  const updateMutation = useUpdateSystemConfigMutation();

  const [key, setKey] = useState("");
  const [showKey, setShowKey] = useState(false);

  useEffect(() => {
    if (smartsuppKey !== undefined && smartsuppKey !== null) {
      // value may be a raw string or wrapped object depending on how SystemConfig stores it
      const val = typeof smartsuppKey === "string" ? smartsuppKey : String(smartsuppKey ?? "");
      setKey(val);
    }
  }, [smartsuppKey]);

  const isActive = key.trim().length > 0;

  const handleSave = async () => {
    try {
      await updateMutation.mutateAsync({ key: "smartsupp_key", value: key.trim() });
      toast.success("Smartsupp key saved. The chat widget will appear on all public and dashboard pages.");
    } catch (error: any) {
      toast.error(error.message || "Failed to save Smartsupp key");
    }
  };

  const handleClear = async () => {
    try {
      await updateMutation.mutateAsync({ key: "smartsupp_key", value: "" });
      setKey("");
      toast.success("Smartsupp chat widget disabled.");
    } catch (error: any) {
      toast.error(error.message || "Failed to disable chat widget");
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-12">
        <Loader2 className="h-8 w-8 animate-spin text-indigo-500" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Card className="bg-white dark:bg-slate-900 border-accent/20">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <MessageCircle className="h-5 w-5 text-indigo-500" />
              Smartsupp Live Chat
            </CardTitle>
            <Badge
              variant={isActive ? "default" : "secondary"}
              className={isActive ? "bg-emerald-500 hover:bg-emerald-600" : ""}
            >
              {isActive ? "Active" : "Disabled"}
            </Badge>
          </div>
          <CardDescription>
            Embed a live chat widget on all public-facing pages and the user dashboard.
            Users can reach support without leaving the app.{" "}
            <a
              href="https://app.smartsupp.com"
              target="_blank"
              rel="noopener noreferrer"
              className="text-indigo-500 hover:underline inline-flex items-center gap-1"
            >
              Open Smartsupp dashboard <ExternalLink className="h-3 w-3" />
            </a>
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-6">
          <div className="space-y-2">
            <Label htmlFor="smartsupp-key">Smartsupp Widget Key</Label>
            <div className="relative">
              <Input
                id="smartsupp-key"
                type={showKey ? "text" : "password"}
                placeholder="e.g. bb4e3e8124f9ba118d58ddc33d32a48691e80b23"
                value={key}
                onChange={(e) => setKey(e.target.value)}
                className="pr-10 font-mono text-sm"
              />
              <button
                type="button"
                onClick={() => setShowKey((p) => !p)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                {showKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
            <p className="text-xs text-muted-foreground">
              Find this in your Smartsupp account under{" "}
              <span className="font-medium">Settings → Chat box → Smartsupp key</span>.
              Leave empty to hide the widget entirely.
            </p>
          </div>

          {isActive && (
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 dark:border-emerald-900/40 dark:bg-emerald-950/20 p-4 text-sm text-emerald-800 dark:text-emerald-400 space-y-1">
              <p className="font-semibold">Chat widget is live.</p>
              <p className="text-emerald-700 dark:text-emerald-500">
                Visitors on the landing page, downloads, and authenticated users on the dashboard will see the chat bubble.
                Logged-in users are automatically identified by name and email.
              </p>
            </div>
          )}
        </CardContent>

        <CardFooter className="bg-slate-50 dark:bg-slate-800/50 p-4 border-t flex items-center justify-between gap-4">
          {isActive && (
            <Button
              variant="outline"
              onClick={handleClear}
              disabled={updateMutation.isPending}
              className="text-destructive border-destructive/30 hover:bg-destructive/10"
            >
              Disable Widget
            </Button>
          )}
          <Button
            onClick={handleSave}
            disabled={updateMutation.isPending}
            className="bg-indigo-600 hover:bg-indigo-700 ml-auto"
          >
            {updateMutation.isPending ? (
              <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <Save className="w-4 h-4 mr-2" />
            )}
            Save Key
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}
