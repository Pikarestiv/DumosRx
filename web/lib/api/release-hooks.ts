import { useQuery } from "@tanstack/react-query";
import { webApiClient } from "./client";
import { useScopedKey } from "./query-scope";
import { APP_VERSION, DOWNLOAD_URL } from "@/lib/constants";

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

interface DownloadsManifest {
  version: string;
  platforms: {
    windows: ManifestPlatform;
    macos: ManifestPlatform;
    linux: ManifestPlatform;
    android: ManifestPlatform;
  };
}

const ADMIN_MANIFEST_ENDPOINT = "admin/downloads/manifest";
const PUBLIC_MANIFEST_ENDPOINT = "downloads/manifest";

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

function toReleaseLinks(data: DownloadsManifest): ReleaseLinks {
  const { windows, macos, linux, android } = data.platforms;

  return {
    windows: windows.url,
    macos: macos.url,
    linux: linux.exists ? linux.url : "",
    android: android.exists ? android.url : "",
    version: data.version,
    winSize: formatSize(windows.sizeBytes),
    macSize: formatSize(macos.sizeBytes),
    linuxSize: formatSize(linux.sizeBytes),
    androidSize: formatSize(android.sizeBytes),
  };
}

/** What the Downloads pages render before (or instead of) a manifest fetch:
 * the download host itself, so a visitor still has somewhere to go. */
export const FALLBACK_RELEASE_LINKS: ReleaseLinks = {
  windows: DOWNLOAD_URL,
  macos: DOWNLOAD_URL,
  linux: DOWNLOAD_URL,
  android: DOWNLOAD_URL,
  version: APP_VERSION,
  winSize: "---",
  macSize: "---",
  linuxSize: "---",
  androidSize: "---",
};

function fallbackReleaseLinks(): ReleaseLinks {
  const cleanVersion = APP_VERSION.replace(/^v/, "");

  return {
    windows: `${DOWNLOAD_URL}/v${cleanVersion}/DumosRx_${cleanVersion}_x64_en-US.msi`,
    macos: `${DOWNLOAD_URL}/v${cleanVersion}/DumosRx_${cleanVersion}_aarch64.dmg`,
    linux: "",
    android: "",
    version: APP_VERSION,
    winSize: "",
    macSize: "",
    linuxSize: "",
    androidSize: "",
  };
}

async function fetchReleaseLinks(endpoint: string): Promise<ReleaseLinks> {
  try {
    return toReleaseLinks(await webApiClient.request<DownloadsManifest>(endpoint));
  } catch {
    console.warn(`Failed to fetch ${endpoint}, using fallback APP_VERSION`);
    return fallbackReleaseLinks();
  }
}

const STALE_TIME_MS = 60 * 60 * 1000;

export const useLatestRelease = () => {
  return useQuery({
    queryKey: useScopedKey(["latest-release"]),
    queryFn: () => fetchReleaseLinks(ADMIN_MANIFEST_ENDPOINT),
    staleTime: STALE_TIME_MS,
  });
};

export const usePublicLatestRelease = () => {
  return useQuery({
    queryKey: ["public-latest-release"],
    queryFn: () => fetchReleaseLinks(PUBLIC_MANIFEST_ENDPOINT),
    staleTime: STALE_TIME_MS,
  });
};
