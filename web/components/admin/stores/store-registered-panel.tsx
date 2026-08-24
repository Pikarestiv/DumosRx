"use client";

import {
  CheckCircle2,
  Monitor,
  Laptop,
  Globe,
  ArrowRight,
  Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useLatestRelease } from "@/lib/api/release-hooks";
import { getAppURL } from "@/lib/constants";

interface StoreRegisteredPanelProps {
  storeName: string;
  username: string;
  onDone: () => void;
}

export function StoreRegisteredPanel({
  storeName,
  username,
  onDone,
}: StoreRegisteredPanelProps) {
  const { data: release, isLoading: releaseLoading } = useLatestRelease();

  const downloadOptions = [
    { os: "Windows", icon: Monitor, link: release?.windows },
    { os: "macOS", icon: Laptop, link: release?.macos },
  ];

  return (
    <div className="bg-white dark:bg-slate-900 rounded-[2rem] p-8 shadow-sm border border-slate-200 dark:border-slate-800 text-center">
      <div className="h-16 w-16 rounded-2xl bg-emerald-500/10 text-emerald-500 flex items-center justify-center mx-auto mb-6">
        <CheckCircle2 className="h-8 w-8" />
      </div>
      <h2 className="text-2xl font-black text-slate-900 dark:text-white">
        {storeName} is registered
      </h2>
      <p className="text-slate-500 dark:text-slate-400 font-medium mt-1">
        Login: <span className="font-bold text-slate-700 dark:text-slate-300">{username}</span> — share these download links with the store owner to get set up.
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-8 max-w-md mx-auto">
        {downloadOptions.map(({ os, icon: Icon, link }) => (
          <Button
            key={os}
            asChild={!releaseLoading && !!link}
            variant="outline"
            disabled={releaseLoading || !link}
            className="h-14 rounded-2xl font-bold justify-start gap-3"
          >
            {releaseLoading ? (
              <span className="flex items-center gap-3">
                <Loader2 className="h-5 w-5 animate-spin" />
                Loading...
              </span>
            ) : link ? (
              <a href={link} target="_blank" rel="noopener noreferrer">
                <Icon className="h-5 w-5" />
                Download for {os}
              </a>
            ) : (
              <span className="flex items-center gap-3">
                <Icon className="h-5 w-5" />
                Download for {os}
              </span>
            )}
          </Button>
        ))}
      </div>

      <a
        href={getAppURL()}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-2 text-sm font-bold text-indigo-600 dark:text-indigo-400 hover:underline mt-4"
      >
        <Globe className="h-4 w-4" />
        Or use it in the browser instead
      </a>

      <div className="mt-8">
        <Button
          onClick={onDone}
          className="bg-indigo-600 hover:bg-indigo-700 h-12 px-8 rounded-2xl font-black"
        >
          Continue to Stores
          <ArrowRight className="ml-2 h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
