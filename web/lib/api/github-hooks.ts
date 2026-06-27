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
      let version = APP_VERSION;
      try {
        const res = await fetch(`https://downloads.dumosrx.com/updater.json`);
        if (res.ok) {
          const data = await res.json();
          if (data.version) version = data.version;
        }
      } catch (e) {
        console.warn("Failed to fetch updater.json, using fallback APP_VERSION");
      }
      
      const cleanVersion = version.replace(/^v/, '');

      return {
        windows: `https://downloads.dumosrx.com/DumosRx_${cleanVersion}_x64_en-US.msi`,
        macos: `https://downloads.dumosrx.com/DumosRx_${cleanVersion}_x64.dmg`,
        linux: `https://downloads.dumosrx.com/DumosRx_${cleanVersion}_amd64.AppImage`,
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
