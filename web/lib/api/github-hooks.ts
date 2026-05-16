import { useQuery } from "@tanstack/react-query";
import { GITHUB_REPO, APP_VERSION } from "@/lib/constants";

export interface ReleaseLinks {
  windows: string;
  macos: string;
  linux: string;
  version: string;
  winSize: string;
  macSize: string;
  linuxSize: string;
}

const formatSize = (bytes: number) => {
  if (!bytes) return "";
  return (bytes / (1024 * 1024)).toFixed(1) + " MB";
};

export const useLatestRelease = () => {
  return useQuery({
    queryKey: ["github-latest-release"],
    queryFn: async (): Promise<ReleaseLinks> => {
      const res = await fetch(`https://api.github.com/repos/${GITHUB_REPO}/releases/latest`);
      if (!res.ok) throw new Error("Failed to fetch GitHub release");
      
      const data = await res.json();
      const assets = data.assets || [];

      const win = assets.find((a: any) => 
        a.name.toLowerCase().endsWith(".msi") || 
        a.name.toLowerCase().endsWith("-setup.exe") ||
        a.name.toLowerCase().includes("win")
      );
      const mac = assets.find((a: any) => 
        a.name.toLowerCase().endsWith(".dmg") ||
        a.name.toLowerCase().includes("mac") ||
        a.name.toLowerCase().includes("darwin")
      );
      const linux = assets.find((a: any) => 
        a.name.toLowerCase().endsWith(".appimage") ||
        a.name.toLowerCase().includes("linux")
      );

      const defaultUrl = `https://github.com/${GITHUB_REPO}/releases/latest`;

      return {
        windows: win?.browser_download_url || defaultUrl,
        macos: mac?.browser_download_url || defaultUrl,
        linux: linux?.browser_download_url || defaultUrl,
        version: data.tag_name || APP_VERSION,
        winSize: formatSize(win?.size),
        macSize: formatSize(mac?.size),
        linuxSize: formatSize(linux?.size),
      };
    },
    staleTime: 60 * 60 * 1000, // 1 hour cache
  });
};
