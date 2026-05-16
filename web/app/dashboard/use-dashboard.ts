import { useState, useEffect } from "react";
import { useRouter, useParams } from "next/navigation";
import { useDashboardSummary } from "@/lib/api/hooks";
import { useLatestRelease } from "@/lib/api/github-hooks";
import { APP_VERSION, GITHUB_REPO } from "@/lib/constants";

export function useDashboard() {
  const router = useRouter();
  const params = useParams();
  const viewParam = (params?.view as string) || "overview";

  const { data, isLoading, refetch } = useDashboardSummary();
  const { data: releaseData } = useLatestRelease();
  
  const [activeTab, setActiveTabState] = useState(viewParam);

  // Sync state with path param
  useEffect(() => {
    if (viewParam !== activeTab) {
      setActiveTabState(viewParam);
    }
  }, [viewParam, activeTab]);

  const setActiveTab = (tab: string) => {
    setActiveTabState(tab);
    router.push(`/dashboard/${tab}`);
  };

  const logout = () => {
    localStorage.removeItem("drx_token");
    router.push("/login");
  };

  const defaultReleaseLinks = {
    windows: `https://github.com/${GITHUB_REPO}/releases/latest`,
    macos: `https://github.com/${GITHUB_REPO}/releases/latest`,
    linux: `https://github.com/${GITHUB_REPO}/releases/latest`,
    version: APP_VERSION,
    winSize: "---",
    macSize: "---",
    linuxSize: "---",
  };

  return {
    activeTab,
    setActiveTab,
    loading: isLoading,
    data,
    releaseLinks: releaseData || defaultReleaseLinks,
    logout,
    refetch,
    user: data?.user || { name: "User", email: "", pharmacy_name: "DumosRx Pharmacy" },
    stores: data?.stores || [],
    stats: data?.stats,
    staff: data?.staff || [],
  };
}
