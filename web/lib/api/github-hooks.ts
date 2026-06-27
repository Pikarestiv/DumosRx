import { useQuery } from "@tanstack/react-query";
import { GITHUB_REPO, APP_VERSION } from "@/lib/constants";

export interface ReleaseLinks {
  windows: string;
  macos: string;
  linux: string;
  android: string;
  version: string;
  winSize: string;
  macSize: string;
  linuxSize: string;
  androidSize: string;
}

const formatSize = (bytes: number) => {
  if (!bytes) return "";
  return (bytes / (1024 * 1024)).toFixed(1) + " MB";
};

export const useLatestRelease = () => {
  return useQuery({
    queryKey: ["github-latest-release"],
    queryFn: async (): Promise<ReleaseLinks> => {
      const res = await fetch(`https://downloads.dumosrx.com/updater.json`);
      if (!res.ok) throw new Error("Failed to fetch updater.json");
      
      const data = await res.json();
      const version = data.version || APP_VERSION;
      const platforms = data.platforms || {};

      const defaultUrl = `https://downloads.dumosrx.com`;

      return {
        windows: platforms["windows-x86_64"]?.url || defaultUrl,
        macos: platforms["darwin-aarch64"]?.url || platforms["darwin-x86_64"]?.url || defaultUrl,
        linux: platforms["linux-x86_64"]?.url || defaultUrl,
        // The APK is also uploaded to the same directory by the github action
        android: `https://downloads.dumosrx.com/app-release.apk`, 
        version: version,
        winSize: "",
        macSize: "",
        linuxSize: "",
        androidSize: "",
      };
    },
    staleTime: 60 * 60 * 1000, // 1 hour cache
  });
};
