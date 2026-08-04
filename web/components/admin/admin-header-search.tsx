"use client";

import { useState, useEffect } from "react";
import {
  Search,
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
  ShieldCheck,
  X,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useRouter } from "next/navigation";
import { ADMIN_SEARCH_ACTIONS, type AdminSearchAction } from "@/lib/constants/admin-search-actions";
import { webApiClient } from "@/lib/api/client";

interface SearchResultItem {
  id: string;
  title: string;
  href: string;
  type: string;
  icon?: string;
}

type SearchResults = Record<string, SearchResultItem[]> & {
  actions?: AdminSearchAction[];
};

export function AdminHeaderSearch() {
  const router = useRouter();
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SearchResults | null>(null);
  const [_isSearching, setIsSearching] = useState(false);
  const [showResults, setShowResults] = useState(false);

  useEffect(() => {
    const delayDebounceFn = setTimeout(async () => {
      if (searchQuery.length >= 2) {
        setIsSearching(true);
        try {
          const results = await webApiClient.request<Record<string, SearchResultItem[]>>(
            `admin/search?query=${encodeURIComponent(searchQuery)}`,
          );

          // Filter static actions/pages from constants
          const adminActions = ADMIN_SEARCH_ACTIONS.filter(
            (action) =>
              action.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
              (action.description &&
                action.description
                  .toLowerCase()
                  .includes(searchQuery.toLowerCase())),
          );

          setSearchResults({
            ...results,
            actions: adminActions,
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

  return (
    <div className="relative group w-full max-w-md hidden md:block">
      <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 group-focus-within:text-indigo-500 transition-colors" />
      <Input
        placeholder="Search stores, users, or products..."
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
          <div
            className="fixed inset-0 z-40"
            onClick={() => setShowResults(false)}
          />
          <div className="absolute top-full left-0 right-0 mt-2 bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 p-2 z-50 max-h-[480px] overflow-y-auto animate-in fade-in slide-in-from-top-2 duration-200">
            {Object.entries(searchResults).map(
              ([type, items]) =>
                items.length > 0 && (
                  <div key={type} className="mb-4 last:mb-0">
                    <div className="px-3 py-1.5 flex items-center justify-between">
                      <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                        {type}
                      </span>
                      <Badge
                        variant="outline"
                        className="text-[10px] bg-slate-50 dark:bg-slate-800 border-none"
                      >
                        {items.length}
                      </Badge>
                    </div>
                    <div className="space-y-0.5">
                      {items.map((item) => (
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
                              const iconName =
                                item.icon ||
                                (item.type === "Store"
                                  ? "Store"
                                  : item.type === "User"
                                    ? "Users"
                                    : item.type === "Product"
                                      ? "Package"
                                      : "Search");

                              let IconComp = Search;
                              switch (iconName) {
                                case "Store":
                                  IconComp = Store;
                                  break;
                                case "Users":
                                  IconComp = Users;
                                  break;
                                case "Package":
                                  IconComp = Package;
                                  break;
                                case "Plus":
                                  IconComp = Plus;
                                  break;
                                case "LayoutDashboard":
                                  IconComp = LayoutDashboard;
                                  break;
                                case "Server":
                                  IconComp = Server;
                                  break;
                                case "Settings":
                                  IconComp = Settings;
                                  break;
                                case "ShieldAlert":
                                  IconComp = ShieldAlert;
                                  break;
                                case "TrendingUp":
                                  IconComp = TrendingUp;
                                  break;
                                case "Database":
                                  IconComp = Database;
                                  break;
                                case "Activity":
                                  IconComp = Activity;
                                  break;
                                case "ShieldCheck":
                                  IconComp = ShieldCheck;
                                  break;
                              }

                              let colors = "text-slate-500";
                              switch (item.type) {
                                case "Store":
                                  colors = "text-indigo-500";
                                  break;
                                case "User":
                                  colors = "text-blue-500";
                                  break;
                                case "Product":
                                  colors = "text-amber-500";
                                  break;
                                case "Action":
                                  colors = "text-rose-500";
                                  break;
                                case "Page":
                                  colors = "text-emerald-500";
                                  break;
                              }

                              return <IconComp className={`h-4 w-4 ${colors}`} />;
                            })()}
                          </div>
                          <div className="flex-1 overflow-hidden">
                            <p className="text-sm font-bold text-slate-900 dark:text-white truncate">
                              {item.title}
                            </p>
                            <p className="text-[10px] text-slate-500 font-medium">
                              {item.type}{" "}
                              {item.id &&
                                !["Action", "Page"].includes(item.type) &&
                                `• ${item.id.substring(0, 8)}`}
                            </p>
                          </div>
                          <ChevronRight className="h-4 w-4 text-slate-300 opacity-0 group-hover:opacity-100 -translate-x-2 group-hover:translate-x-0 transition-all" />
                        </button>
                      ))}
                    </div>
                  </div>
                ),
            )}
            {!Object.values(searchResults).some((items) => items.length > 0) && (
              <div className="p-8 text-center">
                <p className="text-sm font-bold text-slate-500 italic">
                  No results found for "{searchQuery}"
                </p>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
