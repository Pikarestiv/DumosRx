import { useQuery } from "@tanstack/react-query";
import { APP_VERSION, DOWNLOAD_URL, UPDATER_JSON_URL } from "@/lib/constants";

export interface ReleaseLinks {
  windows: string;
  macos: string;
  linux: string;
  android: string;
  version: string;
}

export const useLatestRelease = () => {
  return useQuery({
    queryKey: ["latest-release"],
    queryFn: async (): Promise<ReleaseLinks> => {
      let version = APP_VERSION;
      try {
        const res = await fetch(UPDATER_JSON_URL);
        if (res.ok) {
          const data = await res.json();
          if (data.version) version = data.version;
        }
      } catch (_e) {
        console.warn("Failed to fetch updater.json, using fallback APP_VERSION");
      }

      const cleanVersion = version.replace(/^v/, "");

      return {
        windows: `${DOWNLOAD_URL}/v${cleanVersion}/DumosRx_${cleanVersion}_x64_en-US.msi`,
        macos: `${DOWNLOAD_URL}/v${cleanVersion}/DumosRx_${cleanVersion}_aarch64.dmg`,
        linux: `${DOWNLOAD_URL}/v${cleanVersion}/DumosRx_${cleanVersion}_amd64.AppImage`,
        android: `${DOWNLOAD_URL}/v${cleanVersion}/DumosRx-Android.apk`,
        version,
      };
    },
    staleTime: 60 * 60 * 1000, // 1 hour cache
  });
};
