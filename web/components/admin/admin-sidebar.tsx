"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Users,
  Store,
  Package,
  Settings,
  LogOut,
  ChevronRight,
  ShieldCheck,
  Activity,
  Server,
  Megaphone,
  Mail
} from "lucide-react";
import { useAdminAuthStore } from "@/lib/store/use-admin-auth-store";
import { useAdminStore } from "@/lib/store/use-admin-store";
import { useAdminSummary } from "@/lib/api/admin-hooks";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";

const sidebarItems = [
  { id: "dashboard", name: "Overview", icon: LayoutDashboard, href: "/admin" },
  { id: "pharmacies", name: "Pharmacies", icon: Store, href: "/admin/pharmacies" },
  { id: "users", name: "Platform Users", icon: Users, href: "/admin/users" },
  { id: "products", name: "Global Products", icon: Package, href: "/admin/products" },
  { id: "broadcasts", name: "Global Broadcasts", icon: Megaphone, href: "/admin/broadcasts" },
  { id: "email-templates", name: "Email Templates", icon: Mail, href: "/admin/email-templates" },
  { id: "system", name: "System Health", icon: Server, href: "/admin/system" },
];

export function AdminSidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const { user, logout } = useAdminAuthStore();
  const { isLoading, error } = useAdminSummary();

  const handleLogout = () => {
    logout();
    router.push("/admin/login");
  };

  const userInitials = user ? `${user.first_name[0]}${user.last_name[0]}` : "AD";
  const fullName = user ? `${user.first_name} ${user.last_name}` : "Dumos Admin";
  const email = user ? user.email : "admin@dumostech.com";

  return (
    <aside className="hidden lg:flex w-72 flex-col bg-slate-950 text-slate-200 border-r border-slate-800">
      <div className="p-8">
        <Link href="/admin" className="flex flex-col items-center gap-2 group transition-transform hover:scale-105">
          <Image
            src="/logo.png"
            alt="DumosRx Logo"
            width={80}
            height={24}
            className="h-6 w-auto object-contain brightness-0 invert"
            style={{ height: "auto" }}
            priority
          />
          <div className="flex flex-col items-center text-center">
            <span className="text-[10px] font-black text-indigo-400 uppercase tracking-[0.3em] leading-none">Admin</span>
            <span className="text-[8px] font-bold text-slate-500 uppercase tracking-widest mt-1">Control Center</span>
          </div>
        </Link>
      </div>

      <div className="px-4 mb-4">
        <div className="bg-slate-900/50 rounded-2xl p-4 border border-slate-800/50 flex items-center gap-3">
          <div className={`h-3 w-3 rounded-full ${error ? 'bg-rose-500' : isLoading ? 'bg-amber-500 animate-pulse' : 'bg-green-500 animate-pulse'}`} />
          <div className="flex-1">
            <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">System Status</p>
            <p className="text-sm font-bold text-slate-100">
              {error ? 'Nodes Degrading' : isLoading ? 'Synchronizing...' : 'All Nodes Healthy'}
            </p>
          </div>
          <Activity className="h-4 w-4 text-indigo-400" />
        </div>
      </div>

      <nav className="flex-1 px-4 py-4 space-y-1">
        {sidebarItems.map((item) => {
          const normalizedPathname = pathname?.replace(/\/$/, "") || "";
          const normalizedHref = item.href.replace(/\/$/, "");
          
          const isActive = item.href === "/admin" 
            ? (normalizedPathname === "/admin" || normalizedPathname === "") 
            : normalizedPathname.startsWith(normalizedHref);
          return (
            <Link
              key={item.id}
              href={item.href}
              className={cn(
                "group flex items-center justify-between px-4 py-3.5 rounded-xl text-sm font-semibold transition-all duration-200",
                isActive
                  ? "bg-indigo-600 text-white shadow-lg shadow-indigo-600/20"
                  : "text-slate-400 hover:bg-slate-900 hover:text-white"
              )}
            >
              <div className="flex items-center gap-3">
                <item.icon className={cn(
                  "h-5 w-5 transition-colors",
                  isActive ? "text-white" : "text-slate-500 group-hover:text-indigo-400"
                )} />
                {item.name}
              </div>
              {isActive && <ChevronRight className="h-4 w-4" />}
            </Link>
          );
        })}
      </nav>

      <div className="p-4 border-t border-slate-800">
        <div className="bg-slate-900 rounded-2xl p-4 flex items-center gap-3 border border-slate-800/50">
          <div className="h-10 w-10 rounded-xl bg-indigo-600/10 flex items-center justify-center font-bold text-indigo-400 border border-indigo-600/20 uppercase">
            {userInitials}
          </div>
          <div className="flex-1 overflow-hidden">
            <p className="text-sm font-bold text-white truncate">
              {fullName}
            </p>
            <p className="text-[10px] font-medium text-slate-500 truncate">
              {email}
            </p>
          </div>
          <button 
            onClick={handleLogout}
            className="p-2 hover:bg-slate-800 rounded-lg transition-colors group"
          >
            <LogOut className="h-4 w-4 text-slate-500 group-hover:text-red-400" />
          </button>
        </div>
        
        <div className="mt-4 flex items-center justify-center">
            <p className="text-[10px] text-slate-600 font-medium">DumosRx v2.4.0-Cloud</p>
        </div>
      </div>
    </aside>
  );
}
