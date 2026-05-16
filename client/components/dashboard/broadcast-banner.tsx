"use client";

import { useEffect, useState } from "react";
import { Megaphone, X, Info, AlertTriangle, ShieldAlert, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { apiClient } from "@/lib/api/client";

export function BroadcastBanner() {
  const [broadcasts, setBroadcasts] = useState<any[]>([]);
  const [dismissedIds, setDismissedIds] = useState<string[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);

  useEffect(() => {
    const fetchBroadcasts = async () => {
      try {
        const response = await apiClient.getBroadcasts();
        // The API returns { success: true, data: [...] }
        if (response && response.success && Array.isArray(response.data)) {
          setBroadcasts(response.data);
        } else if (Array.isArray(response)) {
          setBroadcasts(response);
        }
      } catch (error) {
        console.error("Failed to fetch broadcasts:", error);
      }
    };

    fetchBroadcasts();
    // Poll for new broadcasts every 5 minutes
    const interval = setInterval(fetchBroadcasts, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  const visibleBroadcasts = (Array.isArray(broadcasts) ? broadcasts : []).filter(b => !dismissedIds.includes(b.id));

  if (visibleBroadcasts.length === 0) return null;

  const current = visibleBroadcasts[currentIndex];

  const handleDismiss = () => {
    setDismissedIds([...dismissedIds, current.id]);
    if (currentIndex >= visibleBroadcasts.length - 1) {
      setCurrentIndex(0);
    }
  };

  const getBgColor = (type: string) => {
    switch(type) {
      case 'danger': return "bg-rose-500 text-white";
      case 'warning': return "bg-amber-500 text-slate-900";
      case 'success': return "bg-emerald-500 text-white";
      default: return "bg-indigo-600 text-white";
    }
  };

  const getIcon = (type: string) => {
    switch(type) {
      case 'danger': return <ShieldAlert className="h-4 w-4" />;
      case 'warning': return <AlertTriangle className="h-4 w-4" />;
      case 'success': return <CheckCircle2 className="h-4 w-4" />;
      default: return <Megaphone className="h-4 w-4" />;
    }
  };

  return (
    <div className={cn(
      "relative w-full py-2 px-4 flex items-center justify-between gap-4 animate-in slide-in-from-top duration-500",
      getBgColor(current.type)
    )}>
      <div className="flex-1 flex items-center justify-center gap-3">
        <div className="hidden sm:flex items-center justify-center p-1.5 bg-white/20 rounded-lg">
          {getIcon(current.type)}
        </div>
        <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-3 text-center sm:text-left">
          <span className="font-black text-xs uppercase tracking-widest opacity-80">{current.title}</span>
          <span className="hidden sm:block opacity-50">•</span>
          <span className="text-sm font-bold tracking-tight">{current.message}</span>
        </div>
      </div>
      
      <div className="flex items-center gap-2">
        {visibleBroadcasts.length > 1 && (
          <span className="text-[10px] font-black opacity-60 uppercase">
            {currentIndex + 1} / {visibleBroadcasts.length}
          </span>
        )}
        <button 
          onClick={handleDismiss}
          className="p-1.5 hover:bg-white/20 rounded-lg transition-colors"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
