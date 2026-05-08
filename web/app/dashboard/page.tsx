"use client";

import { useState, useEffect } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { 
  LayoutDashboard, 
  Store, 
  CreditCard, 
  Download, 
  LogOut, 
  Bell, 
  Search,
  MoreVertical,
  Activity,
  Users,
  Package,
  TrendingUp,
  Circle,
  Menu,
  Pill,
  Plus,
  Smartphone,
  Loader2
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { SubscriptionWrapper } from "@/components/dashboard/subscription-wrapper";
import { webApiClient } from "@/lib/api/client";

export default function DashboardPage() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState("overview");
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<any>(null);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const response = await webApiClient.getDashboardSummary();
        setData(response);
      } catch (error) {
        console.error("Failed to fetch dashboard data:", error);
        // If unauthorized, redirect to login
        if (error instanceof Error && error.message.includes("401")) {
           router.push("/login");
        }
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [router]);

  const sidebarItems = [
    { id: "overview", name: "Overview", icon: LayoutDashboard },
    { id: "fleet", name: "Store Fleet", icon: Store },
    { id: "billing", name: "Subscription", icon: CreditCard },
    { id: "downloads", name: "App Downloads", icon: Download },
  ];

  if (loading) {
    return (
      <div className="h-screen w-full flex items-center justify-center bg-muted/40">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="h-12 w-12 text-primary animate-spin" />
          <p className="text-muted-foreground font-medium">Loading your cloud dashboard...</p>
        </div>
      </div>
    );
  }

  // Fallback to empty if data failed but didn't redirect
  const stats = data?.stats || { total_sales: 0, inventory_value: 0, total_customers: 0, active_stores: 0 };
  const user = data?.user || { name: "User", email: "", pharmacy_name: "DumosRx Pharmacy" };
  const recentSales = data?.recent_sales || [];

  // Mocking store status for now as backend doesn't have a formal Store model yet
  // In future, this would come from a /stores endpoint
  const stores = [
    { name: user.pharmacy_name + " (HQ)", id: "STR-001", status: "online", lastSync: "Just now", sales: `₦${(stats.total_sales).toLocaleString()}` },
  ];

  return (
    <div className="flex h-screen bg-muted/40 overflow-hidden">
      {/* Sidebar */}
      <aside className="hidden lg:flex w-72 flex-col bg-background border-r">
        <div className="p-6">
          <Link href="/" className="flex items-center space-x-2">
            <div className="bg-primary p-1.5 rounded-lg">
               <Pill className="h-6 w-6 text-white" />
            </div>
            <span className="text-xl font-bold tracking-tight">Dumos<span className="text-primary">Rx</span> Cloud</span>
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
                  : "text-muted-foreground hover:bg-muted"
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
               {user.name.charAt(0)}
            </div>
            <div className="flex-1 overflow-hidden">
               <p className="text-sm font-bold truncate">{user.name}</p>
               <p className="text-xs text-muted-foreground truncate">{user.email}</p>
            </div>
            <button onClick={() => { localStorage.removeItem("drx_token"); router.push("/login"); }}>
               <LogOut className="h-4 w-4 text-muted-foreground hover:text-destructive transition-colors" />
            </button>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Header */}
        <header className="h-20 bg-background border-b flex items-center justify-between px-8">
           <div className="flex items-center gap-4 flex-1">
              <div className="relative w-full max-w-md hidden md:block">
                 <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                 <Input placeholder="Search records, stores or medicines..." className="pl-10 bg-muted/50 border-none focus-visible:ring-primary" />
              </div>
           </div>
           <div className="flex items-center gap-4">
              <Button variant="ghost" size="icon" className="relative">
                 <Bell className="h-5 w-5" />
                 <span className="absolute top-2 right-2 w-2 h-2 bg-destructive rounded-full" />
              </Button>
              <Button className="lg:hidden" variant="ghost" size="icon">
                 <Menu className="h-6 w-6" />
              </Button>
           </div>
        </header>

        {/* Scrollable Area */}
        <main className="flex-1 overflow-y-auto p-8">
           {activeTab === "overview" && (
             <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
                <div className="flex items-center justify-between">
                   <div>
                      <h1 className="text-3xl font-black tracking-tight">Cloud Overview</h1>
                      <p className="text-muted-foreground">Unified insights for <span className="font-bold text-foreground">{user.pharmacy_name}</span></p>
                   </div>
                   <Button className="font-bold">
                      <Plus className="h-4 w-4 mr-2" />
                      Add New Store
                   </Button>
                </div>

                {/* Stats Grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                   {[
                      { name: "Total Fleet Sales", value: `₦${stats.total_sales.toLocaleString()}`, change: "+12.5%", icon: TrendingUp, color: "text-green-600", bg: "bg-green-100 dark:bg-green-900/20" },
                      { name: "Active Stores", value: `${stats.active_stores}`, change: "Sync Active", icon: Store, color: "text-blue-600", bg: "bg-blue-100 dark:bg-blue-900/20" },
                      { name: "Inventory Value", value: `₦${stats.inventory_value.toLocaleString()}`, change: "Across all", icon: Package, color: "text-purple-600", bg: "bg-purple-100 dark:bg-purple-900/20" },
                      { name: "Fleet Customers", value: `${stats.total_customers.toLocaleString()}`, change: "+84 this week", icon: Users, color: "text-indigo-600", bg: "bg-indigo-100 dark:bg-indigo-900/20" },
                   ].map((stat, i) => (
                      <Card key={i} className="border-none shadow-sm hover:shadow-md transition-shadow">
                         <CardContent className="p-6">
                            <div className="flex items-center justify-between mb-4">
                               <div className={`${stat.bg} p-3 rounded-2xl`}>
                                  <stat.icon className={`h-6 w-6 ${stat.color}`} />
                               </div>
                               <Badge variant="secondary" className="bg-muted font-bold">{stat.change}</Badge>
                            </div>
                            <div>
                               <p className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">{stat.name}</p>
                               <h3 className="text-2xl font-black mt-1">{stat.value}</h3>
                            </div>
                         </CardContent>
                      </Card>
                   ))}
                </div>

                <div className="grid lg:grid-cols-3 gap-8">
                   {/* Store Fleet Table */}
                   <Card className="lg:col-span-2 border-none shadow-sm">
                      <CardHeader className="flex flex-row items-center justify-between">
                         <div>
                            <CardTitle>Connected Stores</CardTitle>
                            <CardDescription>Real-time sync status for your local pharmacy instances.</CardDescription>
                         </div>
                         <Button variant="ghost" size="sm" className="font-bold">View All</Button>
                      </CardHeader>
                      <CardContent>
                         <Table>
                            <TableHeader>
                               <TableRow className="hover:bg-transparent border-muted">
                                  <TableHead className="font-bold text-xs uppercase">Store Name</TableHead>
                                  <TableHead className="font-bold text-xs uppercase text-center">Status</TableHead>
                                  <TableHead className="font-bold text-xs uppercase text-center">Last Sync</TableHead>
                                  <TableHead className="font-bold text-xs uppercase text-right">Total Sales</TableHead>
                               </TableRow>
                            </TableHeader>
                            <TableBody>
                               {stores.map((store) => (
                                  <TableRow key={store.id} className="border-muted hover:bg-muted/30">
                                     <TableCell className="font-bold py-4">{store.name}</TableCell>
                                     <TableCell className="text-center">
                                        <div className="flex items-center justify-center gap-2">
                                           <Circle className={`h-2 w-2 fill-current ${store.status === 'online' ? 'text-green-500' : 'text-slate-300'}`} />
                                           <span className="text-sm capitalize font-medium">{store.status}</span>
                                        </div>
                                     </TableCell>
                                     <TableCell className="text-center text-sm text-muted-foreground">{store.lastSync}</TableCell>
                                     <TableCell className="text-right font-black">{store.sales}</TableCell>
                                  </TableRow>
                               ))}
                               {stores.length === 0 && (
                                  <TableRow>
                                     <TableCell colSpan={4} className="text-center py-8 text-muted-foreground">
                                        No stores linked yet.
                                     </TableCell>
                                  </TableRow>
                               )}
                            </TableBody>
                         </Table>
                      </CardContent>
                   </Card>

                   {/* Subscription Card */}
                   <div className="space-y-6">
                      <SubscriptionWrapper />
                      <Card className="border-none shadow-sm bg-primary text-primary-foreground">
                         <CardHeader>
                            <CardTitle className="text-xl">Cloud Storage</CardTitle>
                            <CardDescription className="text-primary-foreground/70">Secure, encrypted cloud backup.</CardDescription>
                         </CardHeader>
                         <CardContent>
                            <div className="space-y-2">
                               <div className="flex justify-between text-sm font-bold">
                                  <span>2.4 GB / 10 GB</span>
                                  <span>24%</span>
                               </div>
                               <div className="h-2 bg-white/20 rounded-full overflow-hidden">
                                  <div className="h-full bg-white w-[24%]" />
                               </div>
                            </div>
                         </CardContent>
                      </Card>
                   </div>
                </div>
             </div>
           )}

           {activeTab === "fleet" && (
              <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
                <h1 className="text-3xl font-black tracking-tight mb-8">Store Management</h1>
                <Card className="border-none shadow-sm p-12 text-center">
                   <div className="max-w-md mx-auto space-y-4">
                      <div className="bg-muted h-20 w-20 rounded-full flex items-center justify-center mx-auto">
                         <Store className="h-10 w-10 text-muted-foreground" />
                      </div>
                      <h2 className="text-xl font-bold">Detailed Fleet Management</h2>
                      <p className="text-muted-foreground">Manage your branch locations and view per-branch inventory levels.</p>
                      <Button variant="outline">Link a New Device</Button>
                   </div>
                </Card>
              </div>
           )}

           {activeTab === "billing" && (
              <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 max-w-2xl">
                 <h1 className="text-3xl font-black tracking-tight mb-8">Subscription & Billing</h1>
                 <SubscriptionWrapper />
              </div>
           )}

           {activeTab === "downloads" && (
              <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
                 <h1 className="text-3xl font-black tracking-tight mb-8">App Downloads</h1>
                 <div className="grid md:grid-cols-2 gap-8">
                    {[
                       { os: "macOS", desc: "For Apple Silicon (M1/M2/M3)", version: "v1.2.4", icon: Smartphone },
                       { os: "Windows", desc: "For Windows 10/11 (x64)", version: "v1.2.4", icon: LayoutDashboard },
                    ].map((item, i) => (
                       <Card key={i} className="border-none shadow-sm hover:border-primary/30 border-2 transition-all">
                          <CardHeader className="flex flex-row items-center gap-4">
                             <div className="bg-primary/10 p-4 rounded-2xl">
                                <Download className="h-8 w-8 text-primary" />
                             </div>
                             <div>
                                <CardTitle>{item.os}</CardTitle>
                                <CardDescription>{item.desc}</CardDescription>
                             </div>
                          </CardHeader>
                          <CardContent className="flex items-center justify-between border-t pt-6 mt-2">
                             <div className="text-sm font-bold text-muted-foreground uppercase tracking-widest">Version {item.version}</div>
                             <Button className="font-bold">Download Now</Button>
                          </CardContent>
                       </Card>
                    ))}
                 </div>
              </div>
           )}
        </main>
      </div>
    </div>
  );
}
