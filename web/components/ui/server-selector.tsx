"use client";

import { useEffect, useState } from "react";
import { getBaseURL, setBaseURL } from "@/lib/api/base-client";
import { APP_URL, getAppURL, setAppURL } from "@/lib/constants";
import { API_ENVIRONMENTS, APP_ENVIRONMENTS } from "@/lib/api/server-environments";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Server, Check } from "lucide-react";
import { toast } from "sonner";

export const ENVIRONMENTS = API_ENVIRONMENTS;

export const getCurrentEnvironmentName = (baseURL: string) => {
  return ENVIRONMENTS.find((env) => env.url === baseURL)?.name || "Custom Server";
};

/**
 * Hidden in production by default so a customer can never point their app at
 * the wrong API. `allowInProduction` is for the admin header, which renders
 * it only for a super admin — see web/AGENTS.md.
 */
export function ServerSelector({ allowInProduction = false }: { allowInProduction?: boolean } = {}) {
  const [currentUrl, setCurrentUrl] = useState<string>("");
  const [appUrl, setAppUrlInput] = useState<string>("");

  useEffect(() => {
    // getBaseURL()/getAppURL() reflect localStorage overrides that aren't
    // available during SSR, so they can only be read post-mount.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setCurrentUrl(getBaseURL());
    setAppUrlInput(getAppURL());
  }, []);

  const handleSelect = (url: string) => {
    setBaseURL(url);
    setCurrentUrl(url);
    toast.success("Server environment updated");
    // Reload the page to ensure all instances/fetchers use the new URL
    window.location.reload();
  };

  const handleSaveAppUrl = () => {
    const trimmed = appUrl.trim().replace(/\/$/, "");
    setAppURL(trimmed);
    setAppUrlInput(trimmed || APP_URL);
    toast.success("App URL updated");
  };

  const handleSelectAppUrl = (url: string) => {
    setAppURL(url);
    setAppUrlInput(url);
    toast.success("App URL updated");
  };

  const isProductionBuild = process.env.NODE_ENV === "production";

  if (!currentUrl) return null;
  if (isProductionBuild && !allowInProduction) return null;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="text-[10px] h-6 px-2 text-gray-400 hover:bg-primary hover:text-white transition-colors flex items-center gap-1"
        >
          <Server className="h-3 w-3" />
          Server Config
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel className="text-xs">
          API Environment
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {ENVIRONMENTS.map((env) => (
          <DropdownMenuItem
            key={env.url}
            onClick={() => handleSelect(env.url)}
            className="flex items-center justify-between text-xs py-2"
          >
            <div className="flex flex-col">
              <span className="font-medium">{env.name}</span>
              <span className="text-[10px] text-muted-foreground">
                {env.url}
              </span>
            </div>
            {currentUrl === env.url && (
              <Check className="h-4 w-4 text-primary" />
            )}
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuLabel className="text-xs">App URL</DropdownMenuLabel>
        {isProductionBuild ? (
          APP_ENVIRONMENTS.map((env) => (
            <DropdownMenuItem
              key={env.url}
              onClick={() => handleSelectAppUrl(env.url)}
              className="flex items-center justify-between text-xs py-2"
            >
              <div className="flex flex-col">
                <span className="font-medium">{env.name}</span>
                <span className="text-[10px] text-muted-foreground">{env.url}</span>
              </div>
              {appUrl === env.url && <Check className="h-4 w-4 text-primary" />}
            </DropdownMenuItem>
          ))
        ) : (
          <div
            className="flex items-center gap-1 px-2 py-1.5"
            onKeyDown={(e) => e.stopPropagation()}
          >
            <Input
              value={appUrl}
              onChange={(e) => setAppUrlInput(e.target.value)}
              placeholder="http://localhost:3001"
              className="h-7 text-xs"
            />
            <Button
              size="sm"
              className="h-7 px-2 text-xs shrink-0"
              onClick={handleSaveAppUrl}
            >
              Save
            </Button>
          </div>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
