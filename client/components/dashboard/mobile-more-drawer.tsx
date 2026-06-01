"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Input } from "@/components/ui/input";
import { useStore } from "@/lib/context/store-context";
import { useAuth } from "@/lib/context/auth-context";
import { SyncIndicator } from "./sync-indicator";
import { cn } from "@/lib/utils";
import {
  FileText,
  ClipboardList,
  Wallet,
  BarChart3,
  Settings,
  LogOut,
  MessageSquare,
  Search,
} from "lucide-react";

interface MobileMoreDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onOpenFeedback: () => void;
}

export function MobileMoreDrawer({
  open,
  onOpenChange,
  onOpenFeedback,
}: MobileMoreDrawerProps) {
  const pathname = usePathname();
  const { storeType } = useStore();
  const { logout, isAdmin, isPharmacist } = useAuth();
  const [searchQuery, setSearchQuery] = useState("");

  const allModules = [
    ...(storeType === "pharmacy"
      ? [{ name: "Prescriptions", href: "/prescriptions", icon: FileText }]
      : []),
    ...(isAdmin || isPharmacist
      ? [
          { name: "Procurement & Vendors", href: "/procurement", icon: ClipboardList },
          { name: "Expenses", href: "/expenses", icon: Wallet },
          { name: "Reports & Analytics", href: "/reports", icon: BarChart3 },
          { name: "Settings", href: "/settings", icon: Settings },
        ]
      : []),
  ];

  const filteredModules = allModules.filter((m) =>
    m.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="h-[90vh] flex flex-col p-0 pb-6 rounded-t-xl" onOpenAutoFocus={(e) => e.preventDefault()}>
        <SheetHeader className="px-6 pt-6 pb-2 text-left">
          <SheetTitle className="font-serif font-black text-2xl">More</SheetTitle>
        </SheetHeader>
        
        <div className="px-6 pb-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
            <Input 
              placeholder="Search features..." 
              className="pl-9 bg-muted/50 border-0"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-4">
          <div className="space-y-1">
            {filteredModules.length > 0 ? (
              filteredModules.map((item) => {
                const isActive = pathname.startsWith(item.href);
                const Icon = item.icon;
                return (
                  <Link
                    key={item.name}
                    href={item.href}
                    onClick={() => onOpenChange(false)}
                    className={cn(
                      "flex items-center gap-4 px-4 py-4 rounded-xl font-medium transition-colors",
                      isActive
                        ? "bg-primary text-primary-foreground shadow-sm"
                        : "text-foreground hover:bg-muted"
                    )}
                  >
                    <Icon className="h-5 w-5 opacity-90" />
                    <span>{item.name}</span>
                  </Link>
                );
              })
            ) : (
              <div className="py-8 text-center text-muted-foreground text-sm">
                No features found for "{searchQuery}"
              </div>
            )}
          </div>

          <div className="mt-8 mb-4 border-t border-border pt-4 space-y-1">
            <button
              onClick={() => {
                onOpenChange(false);
                onOpenFeedback();
              }}
              className="w-full flex items-center gap-4 px-4 py-4 rounded-xl font-medium text-foreground hover:bg-muted transition-colors"
            >
              <MessageSquare className="h-5 w-5 opacity-90" />
              <span>Help & Feedback</span>
            </button>
            <button
              onClick={() => {
                onOpenChange(false);
                logout();
              }}
              className="w-full flex items-center gap-4 px-4 py-4 rounded-xl font-medium text-destructive hover:bg-destructive/10 transition-colors"
            >
              <LogOut className="h-5 w-5 opacity-90" />
              <span>Sign Out</span>
            </button>
          </div>
        </div>
        
        {/* Sync Indicator at the bottom */}
        <div className="px-6 mt-auto">
          <SyncIndicator collapsed={false} />
        </div>
      </SheetContent>
    </Sheet>
  );
}
