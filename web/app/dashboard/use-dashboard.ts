"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { webApiClient } from "@/lib/api/client";
import { APP_VERSION, GITHUB_REPO } from "@/lib/constants";

export function useDashboard() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("drx_dashboard_tab") || "overview";
    }
    return "overview";
  });
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<any>(null);
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
    localStorage.setItem("drx_dashboard_tab", activeTab);
  }, [activeTab]);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [summary, staffData] = await Promise.all([
          webApiClient.getDashboardSummary(),
          webApiClient.getStaff().catch(() => []), // Fallback to empty if endpoint not yet ready
        ]);
        
        setData({
          ...summary,
          staff: staffData.length > 0 ? staffData : summary.staff || [],
        });
      } catch (error) {
        console.error("Failed to fetch dashboard data:", error);
        if (error instanceof Error && error.message.includes("401")) {
          router.push("/login");
        }
      } finally {
        setLoading(false);
      }
    };

    fetchData();

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
  }, [router]);

  const logout = () => {
    localStorage.removeItem("drx_token");
    router.push("/login");
  };

  return {
    activeTab,
    setActiveTab,
    loading,
    data,
    releaseLinks,
    logout,
    user: data?.user || { name: "User", email: "", pharmacy_name: "DumosRx Pharmacy" },
    stores: data?.stores || [],
    stats: data?.stats,
    staff: data?.staff || [],
  };
}
