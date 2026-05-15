"use client";

import Link from "next/link";
import Image from "next/image";
import { 
  LayoutDashboard, 
  Store, 
  Users, 
  CreditCard, 
  Download, 
  LogOut 
} from "lucide-react";

interface SidebarProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
  user: any;
  onLogout: () => void;
}

export function Sidebar({ activeTab, setActiveTab, user, onLogout }: SidebarProps) {
  const sidebarItems = [
    { id: "overview", name: "Overview", icon: LayoutDashboard },
    { id: "fleet", name: "Store Fleet", icon: Store },
    { id: "staff", name: "Staff Management", icon: Users },
    { id: "billing", name: "Subscription", icon: CreditCard },
    { id: "downloads", name: "App Downloads", icon: Download },
  ];

  return (
    <aside className="hidden lg:flex w-72 flex-col bg-background border-r h-full">
      <div className="p-6">
        <Link href="/" className="flex items-center">
          <Image
            src="/logo.png"
            alt="DumosRx Logo"
            width={100}
            height={36}
            className="h-12 w-auto object-contain brightness-0 invert"
            priority
          />
        </Link>
      </div>

      <nav className="flex-1 px-4 py-4 space-y-1">
        {sidebarItems.map((item) => (
          <button
            key={item.id}
            onClick={() => setActiveTab(item.id)}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-semibold transition-all ${
              activeTab === item.id
                ? "bg-primary text-primary-foreground shadow-lg shadow-primary/20"
                : "text-muted-foreground hover:bg-primary/50 hover:text-primary-foreground"
            }`}
          >
            <item.icon className="h-5 w-5" />
            {item.name}
          </button>
        ))}
      </nav>

      <div className="p-4 border-t">
        <div className="bg-muted/50 rounded-2xl p-4 flex items-center gap-3">
          <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center font-bold text-primary">
            {user?.name?.charAt(0) || "U"}
          </div>
          <div className="flex-1 overflow-hidden">
            <p className="text-sm font-bold truncate">{user?.name || "User"}</p>
            <p className="text-xs text-muted-foreground truncate">{user?.email}</p>
          </div>
          <button
            onClick={onLogout}
            className="p-2 hover:bg-destructive/10 rounded-lg transition-colors group"
          >
            <LogOut className="h-4 w-4 text-muted-foreground group-hover:text-destructive transition-colors" />
          </button>
        </div>
      </div>
    </aside>
  );
}
