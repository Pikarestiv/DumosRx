import { useState } from "react";
import {
  LayoutDashboard,
  Store,
  Users,
  Activity,
  Menu,
  CreditCard,
  Download,
  Bell,
  Shield,
  LogOut,
  MessageSquarePlus,
} from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import type { DashboardUser } from "@/lib/types/dashboard";

interface BottomNavProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
  user: DashboardUser | null;
  onLogout: () => void;
}

export function BottomNav({ activeTab, setActiveTab, user, onLogout }: BottomNavProps) {
  const [isMoreOpen, setIsMoreOpen] = useState(false);

  const mainNavItems = [
    { id: "overview", name: "Overview", icon: LayoutDashboard },
    { id: "fleet", name: "Stores", icon: Store },
    { id: "activities", name: "Activity", icon: Activity },
    { id: "staff", name: "Staff", icon: Users },
  ];

  const moreMenuItems = [
    { id: "notifications", name: "Notifications", icon: Bell },
    { id: "billing", name: "Subscription", icon: CreditCard },
    { id: "downloads", name: "App Downloads", icon: Download },
    { id: "profile", name: "Account Security", icon: Shield },
    { id: "support", name: "Support", icon: MessageSquarePlus },
  ];

  const isMoreActive = moreMenuItems.some((item) => item.id === activeTab);

  return (
    <>
      <nav className="fixed bottom-0 left-0 right-0 z-50 bg-background/95 backdrop-blur-xl border-t border-border/50 lg:hidden shadow-[0_-8px_30px_rgba(0,0,0,0.04)] pb-[env(safe-area-inset-bottom)]">
        <div className="flex items-center justify-around px-2 py-2">
          {mainNavItems.map((item) => {
            const isActive = activeTab === item.id || (item.id === "fleet" && activeTab === "store-details");
            return (
              <button
                key={item.id}
                onClick={() => {
                  setActiveTab(item.id);
                  setIsMoreOpen(false);
                }}
                className="flex flex-col items-center justify-center p-1 min-w-[64px] transition-all"
              >
                <div
                  className={`flex items-center justify-center h-8 w-14 rounded-full transition-colors duration-200 ${
                    isActive ? "bg-primary text-primary-foreground shadow-lg shadow-primary/20" : "text-muted-foreground hover:bg-muted"
                  }`}
                >
                  <item.icon className={`h-5 w-5 ${isActive ? "" : "opacity-80"}`} />
                </div>
                <span
                  className={`text-[10px] mt-1 font-bold tracking-tight transition-colors duration-200 ${
                    isActive ? "text-primary" : "text-muted-foreground"
                  }`}
                >
                  {item.name}
                </span>
              </button>
            );
          })}

          <Sheet open={isMoreOpen} onOpenChange={setIsMoreOpen}>
            <SheetTrigger asChild>
              <button className="flex flex-col items-center justify-center p-1 min-w-[64px] transition-all">
                <div
                  className={`flex items-center justify-center h-8 w-14 rounded-full transition-colors duration-200 ${
                    isMoreActive ? "bg-primary text-primary-foreground shadow-lg shadow-primary/20" : "text-muted-foreground hover:bg-muted"
                  }`}
                >
                  <Menu className={`h-5 w-5 ${isMoreActive ? "" : "opacity-80"}`} />
                </div>
                <span
                  className={`text-[10px] mt-1 font-bold tracking-tight transition-colors duration-200 ${
                    isMoreActive ? "text-primary" : "text-muted-foreground"
                  }`}
                >
                  More
                </span>
              </button>
            </SheetTrigger>
            <SheetContent side="bottom" className="rounded-t-3xl border-t-0 p-0 overflow-hidden pb-[env(safe-area-inset-bottom)] max-h-[85vh] flex flex-col">
              <SheetHeader className="p-6 text-left border-b bg-muted/30 shrink-0">
                <SheetTitle className="text-xl font-black">Menu</SheetTitle>
              </SheetHeader>
              
              <div className="p-4 space-y-2 overflow-y-auto scrollbar-hide flex-1">
                {moreMenuItems.map((item) => (
                  <button
                    key={item.id}
                    onClick={() => {
                      setActiveTab(item.id);
                      setIsMoreOpen(false);
                    }}
                    className={`w-full flex items-center gap-3 px-4 py-4 rounded-2xl font-bold transition-all ${
                      activeTab === item.id || (item.id === "fleet" && activeTab === "store-details")
                        ? "bg-primary text-primary-foreground shadow-lg shadow-primary/20"
                        : "text-foreground hover:bg-muted"
                    }`}
                  >
                    <item.icon className="h-5 w-5" />
                    {item.name}
                  </button>
                ))}
              </div>

              <div className="p-6 border-t bg-muted/10 shrink-0">
                <div className="bg-background rounded-2xl p-4 border flex items-center gap-3 shadow-sm mb-4">
                  <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center font-bold text-primary">
                    {user?.name?.charAt(0) || "U"}
                  </div>
                  <div className="flex-1 overflow-hidden">
                    <p className="text-sm font-bold truncate">{user?.name || "User"}</p>
                    <p className="text-xs text-muted-foreground truncate">{user?.email}</p>
                  </div>
                </div>
                <button
                  onClick={() => {
                    setIsMoreOpen(false);
                    onLogout();
                  }}
                  className="w-full flex items-center justify-center gap-2 py-3 rounded-xl font-bold text-destructive bg-destructive/10 hover:bg-destructive hover:text-white transition-colors"
                >
                  <LogOut className="h-4 w-4" />
                  Sign Out
                </button>
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </nav>
    </>
  );
}
