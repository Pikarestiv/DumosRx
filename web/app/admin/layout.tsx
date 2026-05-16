"use client";

import { AdminSidebar } from "@/components/admin/admin-sidebar";
import { ModeToggle } from "@/components/mode-toggle";
import { 
  Bell, 
  Search, 
  Menu,
  ShieldCheck,
  Zap,
  Globe,
  Store,
  Users,
  Package,
  ChevronRight,
  Plus,
  LayoutDashboard,
  Server,
  Settings,
  ShieldAlert,
  TrendingUp,
  Database,
  Activity,
  X
} from "lucide-react";
import { ADMIN_SEARCH_ACTIONS } from "@/lib/constants/admin-search-actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";
import { useAdminAuthStore } from "@/lib/store/use-admin-auth-store";
import { useAdminStore } from "@/lib/store/use-admin-store";
import { webApiClient } from "@/lib/api/client";
import { useAdminSummary } from "@/lib/api/admin-hooks";
import { useRouter, usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user, fetchUser, loading: authLoading, token } = useAdminAuthStore();
  const { latency } = useAdminStore();
  const { data: summary, isLoading: summaryLoading } = useAdminSummary();
  const router = useRouter();
  const pathname = usePathname();
  const [checking, setChecking] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<any>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [showResults, setShowResults] = useState(false);

  const isLoginPage = pathname?.includes("/admin/login");
  
  useEffect(() => {
    const delayDebounceFn = setTimeout(async () => {
      if (searchQuery.length >= 2) {
        setIsSearching(true);
        try {
          const results = await webApiClient.request<any>(`admin/search?query=${encodeURIComponent(searchQuery)}`);
          
          // Filter static actions/pages from constants
          const adminActions = ADMIN_SEARCH_ACTIONS.filter(action => 
            action.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
            (action.description && action.description.toLowerCase().includes(searchQuery.toLowerCase()))
          );

          setSearchResults({
            ...results,
            actions: adminActions
          });
          setShowResults(true);
        } catch (error) {
          console.error("Search error:", error);
        } finally {
          setIsSearching(false);
        }
      } else {
        setSearchResults(null);
        setShowResults(false);
      }
    }, 300);

    return () => clearTimeout(delayDebounceFn);
  }, [searchQuery]);

  const handleSearch = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && searchQuery.trim()) {
      setShowResults(true);
    }
  };

  // Summary is handled by useAdminSummary hook automatically

  const securityAlerts = summary?.security_alerts || [];

  useEffect(() => {
    const checkAuth = async () => {
      if (isLoginPage) {
        setChecking(false);
        return;
      }
      
      if (!user) {
        await fetchUser();
      }
      setChecking(false);
    };
    checkAuth();
  }, [user, fetchUser, isLoginPage]);

  useEffect(() => {
    if (isLoginPage) return;

    if (!checking && (!user || user.role !== 'super_admin')) {
      router.push("/admin/login");
    }
  }, [user, checking, router, isLoginPage]);

  // If on login page, just render children without further checks
  if (isLoginPage) {
    return <>{children}</>;
  }

  if (checking || authLoading || (summaryLoading && !isLoginPage)) {
    return (
      <div className="flex h-screen items-center justify-center bg-slate-950">
        <Loader2 className="h-10 w-10 text-indigo-500 animate-spin" />
      </div>
    );
  }

  if (!user || user.role !== 'super_admin') {
    return null;
  }


  return (
    <div className="flex h-screen bg-slate-50 dark:bg-slate-950 overflow-hidden">
      <AdminSidebar />

      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Admin Header */}
        <header className="h-20 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between px-8 z-10 shadow-sm">
          <div className="flex items-center gap-4 flex-1">
                <div className="relative group w-full max-w-md hidden md:block">
                  <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 group-focus-within:text-indigo-500 transition-colors" />
                  <Input 
                    placeholder="Search pharmacies, users, or products..." 
                    className="pl-11 pr-10 bg-slate-50 dark:bg-slate-900/50 border-slate-200 dark:border-slate-800 rounded-2xl h-11 focus-visible:ring-indigo-500 font-bold transition-all"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    onKeyDown={handleSearch}
                    onFocus={() => searchQuery.length >= 2 && setShowResults(true)}
                  />
                  {searchQuery && (
                    <button 
                      onClick={() => {
                        setSearchQuery("");
                        setShowResults(false);
                        setSearchResults(null);
                      }}
                      className="absolute right-4 top-1/2 -translate-y-1/2 p-1 hover:bg-slate-200 dark:hover:bg-slate-800 rounded-lg text-slate-400 hover:text-slate-600 transition-all"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  )}
              
              {/* Search Results Dropdown */}
              {showResults && searchResults && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setShowResults(false)} />
                  <div className="absolute top-full left-0 right-0 mt-2 bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 p-2 z-50 max-h-[480px] overflow-y-auto animate-in fade-in slide-in-from-top-2 duration-200">
                    {Object.entries(searchResults).map(([type, items]: [string, any]) => (
                      items.length > 0 && (
                        <div key={type} className="mb-4 last:mb-0">
                          <div className="px-3 py-1.5 flex items-center justify-between">
                            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{type}</span>
                            <Badge variant="outline" className="text-[10px] bg-slate-50 dark:bg-slate-800 border-none">{items.length}</Badge>
                          </div>
                          <div className="space-y-0.5">
                            {items.map((item: any) => (
                              <button
                                key={item.id}
                                onClick={() => {
                                  router.push(item.href);
                                  setShowResults(false);
                                  setSearchQuery("");
                                }}
                                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-indigo-50 dark:hover:bg-indigo-500/10 transition-colors text-left group"
                              >
                                <div className="h-8 w-8 rounded-lg bg-slate-100 dark:bg-slate-800 flex items-center justify-center group-hover:bg-indigo-500/10 transition-colors">
                                  {(() => {
                                    const iconName = item.icon || (
                                      item.type === 'Pharmacy' ? 'Store' : 
                                      item.type === 'User' ? 'Users' : 
                                      item.type === 'Product' ? 'Package' : 'Search'
                                    );
                                    const IconComp = ({
                                      Store, Users, Package, Plus, LayoutDashboard, Server, Settings, Search,
                                      ShieldAlert, TrendingUp, Database, Activity, ShieldCheck
                                    } as Record<string, any>)[iconName as any] || Search;
                                    
                                    const colors = ({
                                      Pharmacy: 'text-indigo-500',
                                      User: 'text-blue-500',
                                      Product: 'text-amber-500',
                                      Action: 'text-rose-500',
                                      Page: 'text-emerald-500'
                                    } as Record<string, string>)[item.type as any] || 'text-slate-500';

                                    return <IconComp className={`h-4 w-4 ${colors}`} />;
                                  })()}
                                </div>
                                <div className="flex-1 overflow-hidden">
                                  <p className="text-sm font-bold text-slate-900 dark:text-white truncate">{item.title}</p>
                                  <p className="text-[10px] text-slate-500 font-medium">{item.type} {item.id && !['Action', 'Page'].includes(item.type) && `• ${item.id.substring(0, 8)}`}</p>
                                </div>
                                <ChevronRight className="h-4 w-4 text-slate-300 opacity-0 group-hover:opacity-100 -translate-x-2 group-hover:translate-x-0 transition-all" />
                              </button>
                            ))}
                          </div>
                        </div>
                      )
                    ))}
                    {!Object.values(searchResults).some((items: any) => items.length > 0) && (
                      <div className="p-8 text-center">
                        <p className="text-sm font-bold text-slate-500 italic">No results found for "{searchQuery}"</p>
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>
            
            <div className="hidden lg:flex items-center gap-2 ml-4">
                {(latency > 0 || summaryLoading) && (
                  <Badge variant="outline" className={`${latency > 200 ? 'bg-amber-500/10 text-amber-500 border-amber-500/20' : 'bg-green-500/10 text-green-500 border-green-500/20'} gap-1 font-bold`}>
                      {summaryLoading ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : (
                        <Zap className="h-3 w-3 fill-current" />
                      )}
                      Cloud API: {summaryLoading ? 'Checking...' : `${latency}ms`}
                  </Badge>
                )}
                <Badge variant="outline" className="bg-indigo-500/10 text-indigo-500 border-indigo-500/20 gap-1 font-bold">
                    <Globe className="h-3 w-3" />
                    Production
                </Badge>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <ModeToggle />
            
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="relative hover:bg-indigo-50 dark:hover:bg-indigo-500/10">
                  <Bell className="h-5 w-5 text-slate-500" />
                  {securityAlerts.length > 0 && (
                    <span className="absolute top-2 right-2 w-2 h-2 bg-rose-500 rounded-full border-2 border-white dark:border-slate-900" />
                  )}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-80 p-0 border-slate-200 dark:border-slate-800">
                <div className="p-4 bg-indigo-600 rounded-t-lg">
                    <h3 className="text-white font-bold">Platform Alerts</h3>
                    <p className="text-indigo-100 text-xs">{securityAlerts.length} issues requiring attention</p>
                </div>
                <div className="max-h-[300px] overflow-y-auto">
                  {securityAlerts.map((alert: any, index: number) => (
                    <div key={index} className="p-4 hover:bg-slate-50 dark:hover:bg-slate-800/50 cursor-pointer border-b border-slate-100 dark:border-slate-800">
                      <div className="flex items-center gap-2 mb-1">
                        <Badge className="bg-rose-500 text-[10px]">Alert</Badge>
                        <span className="text-[10px] text-slate-400 ml-auto">{alert.time}</span>
                      </div>
                      <p className="text-sm font-bold dark:text-white">{alert.title}</p>
                      <p className="text-xs text-slate-500 mt-1">{alert.source}</p>
                    </div>
                  ))}
                  {securityAlerts.length === 0 && (
                    <div className="p-8 text-center text-slate-500 italic">
                      No active alerts
                    </div>
                  )}
                </div>
                <DropdownMenuSeparator />
                <div className="p-2">
                    <Button 
                      variant="ghost" 
                      className="w-full text-xs font-bold text-indigo-600 hover:text-indigo-700 hover:bg-indigo-50"
                      onClick={() => router.push("/admin/system")}
                    >
                      View System Logs
                    </Button>
                </div>
              </DropdownMenuContent>
            </DropdownMenu>

            <Button className="lg:hidden" variant="ghost" size="icon">
              <Menu className="h-6 w-6 text-slate-500" />
            </Button>
          </div>
        </header>

        {/* Admin Main Area */}
        <main className="flex-1 overflow-y-auto bg-slate-50 dark:bg-slate-950">
          <div className="p-8 max-w-[1600px] mx-auto">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
