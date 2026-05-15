import { useState, useEffect } from "react";
import { useRouter, useParams } from "next/navigation";
import { webApiClient } from "@/lib/api/client";
import { useDashboardStore } from "@/lib/store/use-dashboard-store";
import { APP_VERSION, GITHUB_REPO } from "@/lib/constants";

export function useDashboard() {
  const router = useRouter();
  const params = useParams();
  const viewParam = (params?.view as string) || "overview";

  const { data, loading, fetchData, resetData: resetStore } = useDashboardStore();
  const [activeTab, setActiveTabState] = useState(viewParam);

  // Sync state with path param
  useEffect(() => {
    if (viewParam !== activeTab) {
      setActiveTabState(viewParam);
    }
  }, [viewParam]);

  const setActiveTab = (tab: string) => {
    setActiveTabState(tab);
    router.push(`/dashboard/${tab}`);
  };

  const [releaseLinks, setReleaseLinks] = useState({
    windows: `https://github.com/${GITHUB_REPO}/releases/latest`,
    macos: `https://github.com/${GITHUB_REPO}/releases/latest`,
    linux: `https://github.com/${GITHUB_REPO}/releases/latest`,
    version: APP_VERSION,
    winSize: "84MB",
    macSize: "78MB",
    linuxSize: "92MB",
  });

  useEffect(() => {
    fetchData(); // Uses store's caching logic
  }, [fetchData]);

  useEffect(() => {
    // Fetch latest release links and sizes
    const fetchReleaseLinks = async () => {
      try {
        const res = await fetch(`https://api.github.com/repos/${GITHUB_REPO}/releases/latest`);
        const releaseData = await res.json();
        if (releaseData.assets) {
          const win = releaseData.assets.find((a: any) => a.name.toLowerCase().endsWith(".msi") || a.name.toLowerCase().endsWith("-setup.exe"));
          const mac = releaseData.assets.find((a: any) => a.name.toLowerCase().endsWith(".dmg"));
          const linux = releaseData.assets.find((a: any) => a.name.toLowerCase().endsWith(".appimage"));
          
          const formatSize = (bytes: number) => {
            if (!bytes) return "";
            return (bytes / (1024 * 1024)).toFixed(1) + " MB";
          };

          setReleaseLinks({
            windows: win?.browser_download_url || `https://github.com/${GITHUB_REPO}/releases/latest`,
            macos: mac?.browser_download_url || `https://github.com/${GITHUB_REPO}/releases/latest`,
            linux: linux?.browser_download_url || null,
            version: releaseData.tag_name || APP_VERSION,
            winSize: formatSize(win?.size),
            macSize: formatSize(mac?.size),
            linuxSize: formatSize(linux?.size),
          });
        }
      } catch (e) {
        console.error("Failed to fetch release links:", e);
      }
    };
    fetchReleaseLinks();
  }, []);


  const logout = () => {
    localStorage.removeItem("drx_token");
    resetStore();
    router.push("/login");
  };

  const resetAccountData = async (type: string = "all") => {
    try {
      const response = await webApiClient.resetData(type);
      await fetchData(true); // Force refresh
      return { success: true, message: response.message };
    } catch (error) {
      console.error("Failed to reset data:", error);
      return { success: false, error: error instanceof Error ? error.message : "Reset failed" };
    }
  };

  return {
    activeTab,
    setActiveTab,
    loading,
    data,
    releaseLinks,
    logout,
    resetAccountData,
    user: data?.user || { name: "User", email: "", pharmacy_name: "DumosRx Pharmacy" },
    stores: data?.stores || [],
    stats: data?.stats,
    staff: data?.staff || [],
  };
}
