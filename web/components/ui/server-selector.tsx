"use client";

import { useEffect, useState } from "react";
import { getBaseURL, setBaseURL } from "@/lib/api/base-client";
import { APP_URL, getAppURL, setAppURL } from "@/lib/constants";
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

const ENVIRONMENTS = [
  {
    name: "Production Server",
    url:
      process.env.NEXT_PUBLIC_API_URL_PROD || "https://api.dumosrx.com/api/v1",
  },
  {
    name: "Staging / Dev Server",
    url:
      process.env.NEXT_PUBLIC_API_URL_STAGING ||
      "https://api.dev.dumosrx.com/api/v1",
  },
  {
    name: "Local Development Server (Herd)",
    url:
      process.env.NEXT_PUBLIC_API_URL_LOCAL_HERD ||
      "https://dumosrx.test/api/v1",
  },
  {
    name: "Local Development Server (localhost)",
    url:
      process.env.NEXT_PUBLIC_API_URL_LOCAL_NODE ||
      "http://localhost:8000/api/v1",
  },
];

export function ServerSelector() {
  const [currentUrl, setCurrentUrl] = useState<string>("");
  const [appUrl, setAppUrlInput] = useState<string>("");

  useEffect(() => {
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

  if (!currentUrl) return null;
  if (process.env.NODE_ENV === "production") return null;

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
        <DropdownMenuLabel className="text-xs">
          App URL (app.dumosrx.com)
        </DropdownMenuLabel>
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
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
