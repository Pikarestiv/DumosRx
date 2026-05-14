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
  Globe,
  Loader2,
  ChevronRight,
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { webApiClient } from "@/lib/api/client";
import { ModeToggle } from "@/components/mode-toggle";
import { APP_VERSION, GITHUB_REPO } from "@/lib/constants";

import { Skeleton } from "@/components/ui/skeleton";

export default function DashboardPage() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("drx_dashboard_tab") || "overview";
    }
    return "overview";
  });
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<any>(null);
  const [releaseLinks, setReleaseLinks] = useState({
    windows: `https://github.com/${GITHUB_REPO}/releases/latest`,
    macos: `https://github.com/${GITHUB_REPO}/releases/latest`,
    linux: `https://github.com/${GITHUB_REPO}/releases/latest`,
    version: APP_VERSION,
    winSize: "84MB",
    macSize: "78MB",
    linuxSize: "92MB",
  });

  useEffect(() => {
    localStorage.setItem("drx_dashboard_tab", activeTab);
  }, [activeTab]);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const response = await webApiClient.getDashboardSummary();
        setData(response);
      } catch (error) {
        console.error("Failed to fetch dashboard data:", error);
        if (error instanceof Error && error.message.includes("401")) {
          router.push("/login");
        }
      } finally {
        setLoading(false);
      }
    };

    fetchData();

    // Fetch latest release links and sizes
    const fetchReleaseLinks = async () => {
      try {
        const res = await fetch(`https://api.github.com/repos/${GITHUB_REPO}/releases/latest`);
        const releaseData = await res.json();
        if (releaseData.assets) {
          const win = releaseData.assets.find((a: any) => a.name.toLowerCase().endsWith(".msi") || a.name.toLowerCase().endsWith("-setup.exe"));
          const mac = releaseData.assets.find((a: any) => a.name.toLowerCase().endsWith(".dmg"));
          const linux = releaseData.assets.find((a: any) => a.name.toLowerCase().endsWith(".appimage"));
          
          const formatSize = (bytes: number) => {
            if (!bytes) return "";
            return (bytes / (1024 * 1024)).toFixed(1) + " MB";
          };

          setReleaseLinks({
            windows: win?.browser_download_url || `https://github.com/${GITHUB_REPO}/releases/latest`,
            macos: mac?.browser_download_url || `https://github.com/${GITHUB_REPO}/releases/latest`,
            linux: linux?.browser_download_url || null,
            version: releaseData.tag_name || APP_VERSION,
            winSize: formatSize(win?.size),
            macSize: formatSize(mac?.size),
            linuxSize: formatSize(linux?.size),
          });
        }
      } catch (e) {
        console.error("Failed to fetch release links:", e);
      }
    };
    fetchReleaseLinks();
  }, [router]);

  const sidebarItems = [
    { id: "overview", name: "Overview", icon: LayoutDashboard },
    { id: "fleet", name: "Store Fleet", icon: Store },
    { id: "billing", name: "Subscription", icon: CreditCard },
    { id: "downloads", name: "App Downloads", icon: Download },
  ];

  if (loading) {
    return <DashboardSkeleton />;
  }

  const stats = data?.stats;
  const user = data?.user || {
    name: "User",
    email: "",
    pharmacy_name: "DumosRx Pharmacy",
  };
  const stores = data?.stores || [];

  return (
    <div className="flex h-screen bg-muted/40 overflow-hidden">
      {/* Sidebar */}
      <aside className="hidden lg:flex w-72 flex-col bg-background border-r">
        <div className="p-6">
          <Link href="/" className="flex items-center">
            <Image
              src="/logo.png"
              alt="DumosRx Logo"
              width={100}
              height={36}
              className="h-12 w-auto object-contain brightness-0 invert"
              //   style={{ height: "auto" }}
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
              <p className="text-sm font-bold truncate">
                {user?.name || "User"}
              </p>
              <p className="text-xs text-muted-foreground truncate">
                {user?.email}
              </p>
            </div>
            <button
              onClick={() => {
                localStorage.removeItem("drx_token");
                router.push("/login");
              }}
            >
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
              <Input
                placeholder="Search records, stores or medicines..."
                className="pl-10 bg-muted/50 border-none focus-visible:ring-primary"
              />
            </div>
          </div>
          <div className="flex items-center gap-4">
            <ModeToggle />
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="relative">
                  <Bell className="h-5 w-5" />
                  <span className="absolute top-2 right-2 w-2 h-2 bg-destructive rounded-full" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-80">
                <DropdownMenuLabel>Notifications</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <div className="max-h-[300px] overflow-y-auto">
                  <DropdownMenuItem className="flex flex-col items-start gap-1 p-3 cursor-pointer">
                    <div className="flex items-center gap-2 w-full">
                      <Badge
                        variant="outline"
                        className="bg-orange-100 text-orange-700 border-orange-200"
                      >
                        Inventory
                      </Badge>
                      <span className="text-[10px] text-muted-foreground ml-auto">
                        2h ago
                      </span>
                    </div>
                    <p className="text-sm font-bold">
                      Low Stock Alert: Lagos Branch
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Paracetamol 500mg is below threshold (5 units left).
                    </p>
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem className="flex flex-col items-start gap-1 p-3 cursor-pointer">
                    <div className="flex items-center gap-2 w-full">
                      <Badge
                        variant="outline"
                        className="bg-blue-100 text-blue-700 border-blue-200"
                      >
                        System
                      </Badge>
                      <span className="text-[10px] text-muted-foreground ml-auto">
                        5h ago
                      </span>
                    </div>
                    <p className="text-sm font-bold">New Store Connected</p>
                    <p className="text-xs text-muted-foreground">
                      "DumosRx Ikeja" has successfully synced its first batch.
                    </p>
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem className="flex flex-col items-start gap-1 p-3 cursor-pointer">
                    <div className="flex items-center gap-2 w-full">
                      <Badge
                        variant="outline"
                        className="bg-red-100 text-red-700 border-red-200"
                      >
                        Security
                      </Badge>
                      <span className="text-[10px] text-muted-foreground ml-auto">
                        1d ago
                      </span>
                    </div>
                    <p className="text-sm font-bold">Failed Login Attempt</p>
                    <p className="text-xs text-muted-foreground">
                      Multiple failed attempts detected for user
                      'admin@dumosrx.com'.
                    </p>
                  </DropdownMenuItem>
                </div>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  className="w-full text-center text-xs text-primary font-bold justify-center py-2 cursor-pointer"
                  onClick={() => setActiveTab("notifications")}
                >
                  View All Notifications
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <Button className="lg:hidden" variant="ghost" size="icon">
              <Menu className="h-6 w-6" />
            </Button>
          </div>
        </header>

        {/* Scrollable Area */}
        <main className="flex-1 overflow-y-auto p-8">
          {activeTab === "notifications" && (
            <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
              <div className="flex items-center justify-between">
                <div>
                  <h1 className="text-3xl font-black tracking-tight">
                    Notifications Center
                  </h1>
                  <p className="text-muted-foreground">
                    Stay updated with your pharmacy fleet's activity
                  </p>
                </div>
                <Button
                  variant="outline"
                  onClick={() => setActiveTab("overview")}
                >
                  Back to Overview
                </Button>
              </div>

              <Card className="border-none shadow-sm">
                <CardContent className="p-0">
                  <div className="divide-y divide-border">
                    {[
                      {
                        title: "Low Stock Alert: Lagos Branch",
                        desc: "Paracetamol 500mg is below threshold (5 units left).",
                        time: "2h ago",
                        type: "Inventory",
                        badge: "bg-orange-100 text-orange-700",
                      },
                      {
                        title: "New Store Connected",
                        desc: "'DumosRx Ikeja' has successfully synced its first batch.",
                        time: "5h ago",
                        type: "System",
                        badge: "bg-blue-100 text-blue-700",
                      },
                      {
                        title: "Failed Login Attempt",
                        desc: "Multiple failed attempts detected for user 'admin@dumosrx.com'.",
                        time: "1d ago",
                        type: "Security",
                        badge: "bg-red-100 text-red-700",
                      },
                      {
                        title: "Subscription Renewed",
                        desc: "Your 'Enterprise Plan' has been successfully renewed for another month.",
                        time: "2d ago",
                        type: "Billing",
                        badge: "bg-green-100 text-green-700",
                      },
                      {
                        title: "Weekly Fleet Report Ready",
                        desc: "Your summary for the period May 1 - May 7 is now available.",
                        time: "3d ago",
                        type: "Reports",
                        badge: "bg-purple-100 text-purple-700",
                      },
                    ].map((notif, i) => (
                      <div
                        key={i}
                        className="flex items-start gap-4 p-6 hover:bg-muted/30 transition-colors cursor-pointer group"
                      >
                        <div
                          className={`mt-1 px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${notif.badge}`}
                        >
                          {notif.type}
                        </div>
                        <div className="flex-1">
                          <div className="flex items-center justify-between">
                            <h4 className="font-bold text-lg group-hover:text-primary transition-colors">
                              {notif.title}
                            </h4>
                            <span className="text-xs text-muted-foreground">
                              {notif.time}
                            </span>
                          </div>
                          <p className="text-muted-foreground mt-1">
                            {notif.desc}
                          </p>
                        </div>
                        <ChevronRight className="h-5 w-5 text-muted-foreground self-center opacity-0 group-hover:opacity-100 transition-opacity" />
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </div>
          )}

          {activeTab === "overview" && (
            <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
              <div className="flex items-center justify-between">
                <div>
                  <h1 className="text-3xl font-black tracking-tight">
                    Cloud Overview
                  </h1>
                  <p className="text-muted-foreground">
                    Unified insights for{" "}
                    <span className="font-bold text-foreground">
                      {user.pharmacy_name}
                    </span>
                  </p>
                </div>
                <Button className="font-bold">
                  <Plus className="h-4 w-4 mr-2" />
                  Add New Store
                </Button>
              </div>

              {/* Stats Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                {[
                  {
                    name: "Total Fleet Sales",
                    value: `₦${(stats?.total_sales?.value || 0).toLocaleString()}`,
                    change: stats?.total_sales?.growth,
                    icon: TrendingUp,
                    color: "text-green-600",
                    bg: "bg-green-100 dark:bg-green-900/20",
                  },
                  {
                    name: "Active Stores",
                    value: `${stats?.stores_count || 0}`,
                    change: stats?.last_sync === "Never" ? "Offline" : "Online",
                    icon: Store,
                    color: "text-blue-600",
                    bg: "bg-blue-100 dark:bg-blue-900/20",
                  },
                  {
                    name: "Inventory Value",
                    value: `₦${(stats?.inventory_value?.value || 0).toLocaleString()}`,
                    change: "Live Stock",
                    icon: Package,
                    color: "text-purple-600",
                    bg: "bg-purple-100 dark:bg-purple-900/20",
                  },
                  {
                    name: "Fleet Customers",
                    value: `${(stats?.customers?.value || 0).toLocaleString()}`,
                    change: stats?.customers?.growth,
                    icon: Users,
                    color: "text-indigo-600",
                    bg: "bg-indigo-100 dark:bg-indigo-900/20",
                  },
                ].map((stat, i) => (
                  <Card
                    key={i}
                    className="border-none shadow-sm hover:shadow-md transition-shadow"
                  >
                    <CardContent className="p-6">
                      <div className="flex items-center justify-between mb-4">
                        <div className={`${stat.bg} p-3 rounded-2xl`}>
                          <stat.icon className={`h-6 w-6 ${stat.color}`} />
                        </div>
                        <Badge
                          variant="secondary"
                          className="bg-muted font-bold"
                        >
                          {stat.change}
                        </Badge>
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
                          {stat.name}
                        </p>
                        <h3 className="text-2xl font-black mt-1">
                          {stat.value}
                        </h3>
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
                      <CardDescription>
                        Real-time sync status for your local pharmacy instances.
                      </CardDescription>
                    </div>
                    <Button variant="ghost" size="sm" className="font-bold">
                      View All
                    </Button>
                  </CardHeader>
                  <CardContent>
                    <Table>
                      <TableHeader>
                        <TableRow className="hover:bg-transparent border-muted">
                          <TableHead className="font-bold text-xs uppercase">
                            Store Name
                          </TableHead>
                          <TableHead className="font-bold text-xs uppercase text-center">
                            Status
                          </TableHead>
                          <TableHead className="font-bold text-xs uppercase text-center">
                            Last Sync
                          </TableHead>
                          <TableHead className="font-bold text-xs uppercase text-right">
                            Total Sales
                          </TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {stores.map((store: any) => (
                          <TableRow
                            key={store.id}
                            className="border-muted hover:bg-muted/30"
                          >
                            <TableCell className="font-bold py-4">
                              <div className="flex flex-col">
                                <span>{store.name}</span>
                                <span className="text-[10px] font-mono text-muted-foreground">
                                  {store.id}
                                </span>
                              </div>
                            </TableCell>
                            <TableCell className="text-center">
                              <div className="flex items-center justify-center gap-2">
                                <Circle
                                  className={`h-2 w-2 fill-current ${store.status === "online" ? "text-green-500" : "text-slate-300"}`}
                                />
                                <span className="text-sm capitalize font-medium">
                                  {store.status}
                                </span>
                              </div>
                            </TableCell>
                            <TableCell className="text-center text-sm text-muted-foreground">
                              {store.lastSync}
                            </TableCell>
                            <TableCell className="text-right font-black">
                              {store.sales}
                            </TableCell>
                          </TableRow>
                        ))}
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
                      <CardDescription className="text-primary-foreground/70">
                        Secure, encrypted cloud backup.
                      </CardDescription>
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
            <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
              <div className="flex items-center justify-between">
                <div>
                  <h1 className="text-3xl font-black tracking-tight">
                    Store Fleet
                  </h1>
                  <p className="text-muted-foreground">
                    Manage and monitor all your connected pharmacy locations
                  </p>
                </div>
                <Button className="font-bold">
                  <Plus className="h-4 w-4 mr-2" />
                  Register New Store
                </Button>
              </div>

              <Card className="border-none shadow-sm">
                <CardHeader>
                  <CardTitle>Connected Store Instances</CardTitle>
                  <CardDescription>
                    Live status and sales performance across your entire
                    network.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <Table>
                    <TableHeader>
                      <TableRow className="hover:bg-transparent border-muted">
                        <TableHead className="font-bold text-xs uppercase">
                          Store Name
                        </TableHead>
                        <TableHead className="font-bold text-xs uppercase text-center">
                          Status
                        </TableHead>
                        <TableHead className="font-bold text-xs uppercase text-center">
                          Location
                        </TableHead>
                        <TableHead className="font-bold text-xs uppercase text-center">
                          Last Sync
                        </TableHead>
                        <TableHead className="font-bold text-xs uppercase text-right">
                          Daily Sales
                        </TableHead>
                        <TableHead className="w-[50px]"></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {stores.map((store: any) => (
                        <TableRow
                          key={store.id}
                          className="border-muted hover:bg-muted/30"
                        >
                          <TableCell className="font-bold py-4">
                            <div className="flex flex-col">
                              <span>{store.name}</span>
                              <span className="text-[10px] font-mono text-muted-foreground">
                                {store.id}
                              </span>
                            </div>
                          </TableCell>
                          <TableCell className="text-center">
                            <Badge
                              variant="outline"
                              className={`${store.status === "online" ? "bg-green-50 text-green-700 border-green-200" : "bg-slate-50 text-slate-500 border-slate-200"} font-bold`}
                            >
                              <Circle
                                className={`h-2 w-2 mr-2 fill-current ${store.status === "online" ? "text-green-500" : "text-slate-300"}`}
                              />
                              {store.status}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-center text-sm font-medium">
                            {store.location || "Nigeria"}
                          </TableCell>
                          <TableCell className="text-center text-sm text-muted-foreground">
                            {store.lastSync}
                          </TableCell>
                          <TableCell className="text-right font-black">
                            {store.sales}
                          </TableCell>
                          <TableCell>
                            <Button variant="ghost" size="icon">
                              <MoreVertical className="h-4 w-4" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            </div>
          )}

          {activeTab === "billing" && (
            <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
              <div>
                <h1 className="text-3xl font-black tracking-tight">
                  Subscription & Billing
                </h1>
                <p className="text-muted-foreground">
                  Manage your plan, payment methods, and billing history
                </p>
              </div>

              <SubscriptionWrapper />

              <Card className="border-none shadow-sm">
                <CardHeader>
                  <CardTitle>Billing History</CardTitle>
                  <CardDescription>
                    View and download your recent invoices.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <Table>
                    <TableHeader>
                      <TableRow className="hover:bg-transparent">
                        <TableHead>Date</TableHead>
                        <TableHead>Description</TableHead>
                        <TableHead>Amount</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="text-right">Invoice</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      <TableRow>
                        <TableCell className="text-sm">May 1, 2026</TableCell>
                        <TableCell className="font-medium text-sm">
                          Enterprise Plan (Monthly)
                        </TableCell>
                        <TableCell className="text-sm">₦45,000</TableCell>
                        <TableCell>
                          <Badge className="bg-green-500">Paid</Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <Button variant="ghost" size="sm">
                            Download
                          </Button>
                        </TableCell>
                      </TableRow>
                      <TableRow>
                        <TableCell className="text-sm">Apr 1, 2026</TableCell>
                        <TableCell className="font-medium text-sm">
                          Enterprise Plan (Monthly)
                        </TableCell>
                        <TableCell className="text-sm">₦45,000</TableCell>
                        <TableCell>
                          <Badge className="bg-green-500">Paid</Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <Button variant="ghost" size="sm">
                            Download
                          </Button>
                        </TableCell>
                      </TableRow>
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            </div>
          )}

          {activeTab === "downloads" && (
            <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
              <div>
                <h1 className="text-3xl font-black tracking-tight">
                  App Downloads
                </h1>
                <p className="text-muted-foreground">
                  Download the DumosRx Local Client for your pharmacy computers
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {[
                  {
                    os: "Windows",
                    icon: Smartphone,
                    version: releaseLinks.version,
                    size: releaseLinks.winSize,
                    link: releaseLinks.windows,
                  },
                  {
                    os: "macOS",
                    icon: Activity,
                    version: releaseLinks.version,
                    size: releaseLinks.macSize,
                    link: releaseLinks.macos,
                  },
                  {
                    os: "Linux",
                    icon: Globe,
                    version: releaseLinks.version + " (AppImage)",
                    size: releaseLinks.linuxSize,
                    link: releaseLinks.linux,
                  },
                ].map((app, i) => (
                  <Card
                    key={i}
                    className="border-none shadow-sm hover:border-primary/50 transition-colors border-2 border-transparent"
                  >
                    <CardContent className="p-8 text-center flex flex-col items-center">
                      <div className="w-16 h-16 bg-primary/10 rounded-3xl flex items-center justify-center text-primary mb-6">
                        <app.icon className="h-8 w-8" />
                      </div>
                      <h3 className="text-xl font-black mb-1">
                        {app.os}
                        {!app.link && (
                          <Badge variant="secondary" className="ml-2 text-[10px] bg-amber-100 text-amber-700 border-amber-200">
                            Coming Soon
                          </Badge>
                        )}
                      </h3>
                      <p className="text-sm text-muted-foreground mb-6">
                        {app.version} {app.size ? `• ${app.size}` : ""}
                      </p>
                      <Button className="w-full font-bold group" asChild disabled={!app.link}>
                        {app.link ? (
                          <a href={app.link}>
                            <Download className="h-4 w-4 mr-2 group-hover:translate-y-0.5 transition-transform" />
                            Download Now
                          </a>
                        ) : (
                          <span>Coming Soon</span>
                        )}
                      </Button>
                    </CardContent>
                  </Card>
                ))}
              </div>

              <Card className="bg-muted/50 border-none">
                <CardContent className="p-8 flex flex-col md:flex-row items-center gap-8">
                  <div className="flex-1">
                    <h4 className="text-lg font-bold mb-2">
                      Why use the Local Client?
                    </h4>
                    <p className="text-muted-foreground text-sm leading-relaxed">
                      The local client app allows your pharmacy to operate 100%
                      offline. It syncs automatically with this cloud dashboard
                      when the internet is available, ensuring zero downtime for
                      your sales and prescriptions.
                    </p>
                  </div>
                  <Button variant="outline" className="font-bold border-2">
                    Installation Guide
                  </Button>
                </CardContent>
              </Card>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}

function DashboardSkeleton() {
  return (
    <div className="flex h-screen bg-muted/40 overflow-hidden">
      {/* Sidebar Skeleton */}
      <aside className="hidden lg:flex w-72 flex-col bg-background border-r">
        <div className="p-6">
          <Skeleton className="h-8 w-28" />
        </div>
        <nav className="flex-1 px-4 py-4 space-y-4">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-12 w-full rounded-xl" />
          ))}
        </nav>
        <div className="p-4 border-t">
          <Skeleton className="h-16 w-full rounded-2xl" />
        </div>
      </aside>

      {/* Main Content Skeleton */}
      <div className="flex-1 flex flex-col overflow-hidden">
        <header className="h-20 bg-background border-b flex items-center justify-between px-8">
          <Skeleton className="h-10 w-96 rounded-lg" />
          <div className="flex gap-4">
            <Skeleton className="h-10 w-10 rounded-full" />
            <Skeleton className="h-10 w-10 rounded-full" />
          </div>
        </header>

        <main className="flex-1 overflow-y-auto p-8 space-y-8">
          <div className="flex justify-between items-center">
            <div className="space-y-2">
              <Skeleton className="h-8 w-64" />
              <Skeleton className="h-4 w-48" />
            </div>
            <Skeleton className="h-10 w-32" />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {[1, 2, 3, 4].map((i) => (
              <Card key={i} className="border-none shadow-sm">
                <CardContent className="p-6 space-y-4">
                  <div className="flex justify-between">
                    <Skeleton className="h-12 w-12 rounded-2xl" />
                    <Skeleton className="h-6 w-16 rounded-full" />
                  </div>
                  <div className="space-y-2">
                    <Skeleton className="h-4 w-24" />
                    <Skeleton className="h-8 w-32" />
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          <Card className="border-none shadow-sm">
            <CardHeader>
              <Skeleton className="h-6 w-48 mb-2" />
              <Skeleton className="h-4 w-64" />
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {[1, 2, 3, 4, 5].map((i) => (
                  <Skeleton key={i} className="h-12 w-full" />
                ))}
              </div>
            </CardContent>
          </Card>
        </main>
      </div>
    </div>
  );
}
