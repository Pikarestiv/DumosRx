import { useQuery } from "@tanstack/react-query";
import { webApiClient } from "./client";
import { useScopedKey } from "./query-scope";
import { APP_VERSION } from "@/lib/constants";

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

interface ManifestPlatform {
  url: string;
  exists: boolean;
  sizeBytes: number | null;
}

interface AdminDownloadsManifest {
  version: string;
  platforms: {
    windows: ManifestPlatform;
    macos: ManifestPlatform;
    linux: ManifestPlatform;
    android: ManifestPlatform;
  };
}

function formatSize(bytes: number | null): string {
  if (bytes === null || Number.isNaN(bytes) || bytes <= 0) {
    return "Unknown size";
  }
  const mb = bytes / (1024 * 1024);
  if (mb >= 1024) {
    return `${(mb / 1024).toFixed(2)} GB`;
  }
  return `${mb.toFixed(1)} MB`;
}

// downloads.dumosrx.com (the CDN hosting the desktop/mobile binaries) sends
// no `Access-Control-Allow-Origin` header on `updater.json` or the binaries
// themselves, so a browser-side `fetch()` from this app's origin straight to
// the CDN is always blocked by CORS — confirmed live: it rejects with
// "TypeError: Failed to fetch" even for a 200 response, and this app is a
// statically-exported Next.js build (`output: "export"` in next.config.ts)
// with no server runtime of its own in production to work around that with
// a same-origin proxy route. The real cross-origin work (reading
// updater.json for the version, then HEAD-probing each platform's
// conventional binary URL for real existence + Content-Length) is instead
// done server-side by the existing Laravel backend, which every other admin
// page already talks to: `GET admin/downloads/manifest`
// (`AdminController::downloadsManifest`).
export const useLatestRelease = () => {
  return useQuery({
    queryKey: useScopedKey(["latest-release"]),
    queryFn: async (): Promise<ReleaseLinks> => {
      try {
        const data = await webApiClient.request<AdminDownloadsManifest>(
          "admin/downloads/manifest",
        );
        const { windows, macos, linux, android } = data.platforms;

        return {
          // Windows/macOS are the primary supported targets and the page
          // has no "Coming Soon" branch for them — keep their URL populated
          // even if the HEAD probe itself failed transiently, same
          // graceful behavior as before this fix.
          windows: windows.url,
          macos: macos.url,
          // Linux/Android DO have a "Coming Soon" branch in the page,
          // gated on `!!currentLinks.linux` / `.android` — only populate
          // the URL when the backend confirmed the file actually exists,
          // so that branch is finally reachable when it should be.
          linux: linux.exists ? linux.url : "",
          android: android.exists ? android.url : "",
          version: data.version,
          winSize: formatSize(windows.sizeBytes),
          macSize: formatSize(macos.sizeBytes),
          linuxSize: formatSize(linux.sizeBytes),
          androidSize: formatSize(android.sizeBytes),
        };
      } catch (_e) {
        console.warn(
          "Failed to fetch admin/downloads/manifest, using fallback APP_VERSION",
        );
        const cleanVersion = APP_VERSION.replace(/^v/, "");
        return {
          windows: `https://downloads.dumosrx.com/v${cleanVersion}/DumosRx_${cleanVersion}_x64_en-US.msi`,
          macos: `https://downloads.dumosrx.com/v${cleanVersion}/DumosRx_${cleanVersion}_aarch64.dmg`,
          // Unknown whether Linux/Android actually exist when the backend
          // itself is unreachable — default to "not confirmed" rather than
          // assuming availability, matching the fix's intent.
          linux: "",
          android: "",
          version: APP_VERSION,
          winSize: "",
          macSize: "",
          linuxSize: "",
          androidSize: "",
        };
      }
    },
    staleTime: 60 * 60 * 1000, // 1 hour cache
  });
};
