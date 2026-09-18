"use client";

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
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Save, RefreshCw, Globe } from "lucide-react";
import type { SocialLinksConfig } from "@/lib/types/admin";

const PLATFORMS = [
  "twitter",
  "facebook",
  "linkedin",
  "github",
  "instagram",
] as const;

interface SocialLinksConfigCardProps {
  socialLinks: SocialLinksConfig;
  setSocialLinks: (links: SocialLinksConfig) => void;
  onSave: () => void;
  isSaving: boolean;
}

export function SocialLinksConfigCard({
  socialLinks,
  setSocialLinks,
  onSave,
  isSaving,
}: SocialLinksConfigCardProps) {
  return (
    <Card className="bg-white dark:bg-slate-900 border-accent/20">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Globe className="h-5 w-5 text-indigo-500" />
          Social Media Configurations
        </CardTitle>
        <CardDescription>
          Update URLs and toggle visibility of social media accounts shown in
          the website footer.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {PLATFORMS.map((platform) => (
          <div
            key={platform}
            className="flex flex-col md:flex-row md:items-center gap-4 p-4 border rounded-xl bg-slate-50 dark:bg-slate-900/50"
          >
            <div className="flex-1 space-y-1">
              <Label className="capitalize font-bold text-sm">
                {platform} URL
              </Label>
              <Input
                type="text"
                placeholder={`e.g. https://${platform}.com/dumosrx`}
                value={socialLinks[platform]}
                onChange={(e) =>
                  setSocialLinks({
                    ...socialLinks,
                    [platform]: e.target.value,
                  })
                }
                disabled={!socialLinks.active_links[platform]}
                className="bg-white dark:bg-slate-900 border-accent/20"
              />
            </div>
            <div className="flex items-center gap-2 shrink-0 md:pt-6">
              <Label
                htmlFor={`toggle-${platform}`}
                className="text-xs text-muted-foreground"
              >
                Active
              </Label>
              <Switch
                id={`toggle-${platform}`}
                checked={socialLinks.active_links[platform]}
                onCheckedChange={(c) =>
                  setSocialLinks({
                    ...socialLinks,
                    active_links: {
                      ...socialLinks.active_links,
                      [platform]: c,
                    },
                  })
                }
              />
            </div>
          </div>
        ))}
      </CardContent>
      <CardFooter className="bg-slate-50 dark:bg-slate-800/50 p-4 border-t flex justify-end">
        <Button
          onClick={onSave}
          disabled={isSaving}
          className="bg-indigo-600 hover:bg-indigo-700"
        >
          {isSaving ? (
            <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
          ) : (
            <Save className="w-4 h-4 mr-2" />
          )}
          Save Social Links
        </Button>
      </CardFooter>
    </Card>
  );
}
