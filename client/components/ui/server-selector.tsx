"use client";

import { useEffect, useState } from "react";
import { apiClient } from "@/lib/api/client";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { Server, Check, Plus } from "lucide-react";
import { toast } from "sonner";

const STATIC_ENVIRONMENTS = [
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
  {
    name: "Android Emulator to Host (artisan serve)",
    url: "http://10.0.2.2:8000/api/v1",
  },
];

export function ServerSelector() {
  const [currentUrl, setCurrentUrl] = useState<string>("");
  const [environments, setEnvironments] = useState(STATIC_ENVIRONMENTS);

  useEffect(() => {
    setCurrentUrl(apiClient.getBaseURL());

    // Dynamically add the current host IP for physical device wireless debugging
    if (typeof window !== "undefined") {
      const hostname = window.location.hostname;
      if (
        hostname &&
        hostname !== "localhost" &&
        hostname !== "127.0.0.1" &&
        hostname !== "tauri.localhost"
      ) {
        setEnvironments((prev) => [
          ...prev,
          {
            name: `Physical Device Host (${hostname})`,
            url: `http://${hostname}:8000/api/v1`,
          },
        ]);
      }
    }
  }, []);

  const handleSelect = (url: string) => {
    apiClient.setBaseURL(url);
    setCurrentUrl(url);
    toast.success("Server environment updated");
  };

  const handleCustomIp = () => {
    const ip = prompt("Enter your Mac's Wi-Fi IP address (e.g. 192.168.1.191):", "192.168.1.");
    if (ip) {
      const customUrl = `http://${ip.trim()}:8000/api/v1`;
      setEnvironments((prev) => [
        ...prev,
        {
          name: `Custom Wi-Fi Host (${ip.trim()})`,
          url: customUrl,
        },
      ]);
      handleSelect(customUrl);
    }
  };

  if (!currentUrl) return null;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="text-[10px] h-6 px-2 text-muted-foreground hover:bg-primary hover:text-white transition-colors flex items-center gap-1"
        >
          <Server className="h-3 w-3" />
          Server Config
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuLabel className="text-xs">
          API Environment
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {environments.map((env) => (
          <DropdownMenuItem
            key={env.url}
            onClick={() => handleSelect(env.url)}
            className="flex items-center justify-between text-xs py-2"
          >
            <div className="flex flex-col gap-1">
              <span className="font-medium">{env.name}</span>
              <span className="text-[10px] text-muted-foreground break-all">
                {env.url}
              </span>
            </div>
            {currentUrl === env.url && (
              <Check className="h-4 w-4 text-primary shrink-0 ml-2" />
            )}
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={handleCustomIp} className="text-xs py-2 text-primary font-medium flex items-center gap-2">
          <Plus className="h-4 w-4" />
          Enter Custom Mac IP...
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
