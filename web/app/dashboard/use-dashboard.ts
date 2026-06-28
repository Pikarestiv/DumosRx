import { useState, useEffect } from "react";
import { useRouter, useParams } from "next/navigation";
import { useDashboardSummary } from "@/lib/api/hooks";
import { useLatestRelease } from "@/lib/api/release-hooks";
import { APP_VERSION } from "@/lib/constants";

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
    windows: `https://downloads.dumosrx.com`,
    macos: `https://downloads.dumosrx.com`,
    linux: `https://downloads.dumosrx.com`,
    android: `https://downloads.dumosrx.com`,
    version: APP_VERSION,
    winSize: "---",
    macSize: "---",
    linuxSize: "---",
    androidSize: "---",
  };

  return {
    activeTab,
    setActiveTab,
    loading: isLoading,
    data,
    releaseLinks: releaseData || defaultReleaseLinks,
    logout,
    refetch,
    user: data?.user || { name: "User", email: "", store_name: "My Store" },
    stores: data?.stores || [],
    stats: data?.stats,
    staff: data?.staff || [],
  };
}
