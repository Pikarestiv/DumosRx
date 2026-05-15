"use client";

import { useState } from "react";
import { ConfirmationModal } from "@/components/dashboard/confirmation-modal";
import { 
  TrendingUp, 
  Store, 
  Package, 
  Users, 
  Plus, 
  Circle,
  Trash2,
  AlertTriangle 
} from "lucide-react";
import { Button } from "@/components/ui/button";
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

interface OverviewViewProps {
  stats: any;
  user: any;
  stores: any[];
  onReset: (type: string) => Promise<any>;
}

export function OverviewView({ stats, user, stores, onReset }: OverviewViewProps) {
  const [resetConfig, setResetConfig] = useState<{
    isOpen: boolean;
    type: string;
    title: string;
    description: string;
  }>({
    isOpen: false,
    type: "all",
    title: "",
    description: "",
  });

  const handleResetClick = (type: string) => {
    const configs: Record<string, { title: string; description: string }> = {
      sales: {
        title: "Clear Sales Records",
        description: "Are you sure you want to delete all sales history? This action cannot be undone.",
      },
      logs: {
        title: "Clear Activity Logs",
        description: "This will permanently delete all activity and system logs for your account.",
      },
      inventory: {
        title: "Clear Inventory",
        description: "Are you sure you want to wipe your online inventory stock? You will need to re-sync from your terminals.",
      },
      customers: {
        title: "Clear Customers",
        description: "This will delete all customer records from the cloud database.",
      },
      all: {
        title: "Full Account Reset",
        description: "WARNING: This will delete ALL data (Sales, Logs, Inventory, Customers). This is irreversible.",
      },
    };

    setResetConfig({
      isOpen: true,
      type,
      ...configs[type],
    });
  };

  const confirmReset = async () => {
    const res = await onReset(resetConfig.type);
    setResetConfig((prev) => ({ ...prev, isOpen: false }));
    if (res.success) {
      // Maybe use a toast here later
    } else {
      alert("Reset failed: " + res.error);
    }
  };

  const statCards = [
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
  ];

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-black tracking-tight">Cloud Overview</h1>
          <p className="text-muted-foreground">
            Unified insights for <span className="font-bold text-foreground">{user.pharmacy_name}</span>
          </p>
        </div>
        <Button className="font-bold">
          <Plus className="h-4 w-4 mr-2" />
          Add New Store
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {statCards.map((stat, i) => (
          <Card key={i} className="border-none shadow-sm hover:shadow-md transition-shadow">
            <CardContent className="p-6">
              <div className="flex items-center justify-between mb-4">
                <div className={`${stat.bg} p-3 rounded-2xl`}>
                  <stat.icon className={`h-6 w-6 ${stat.color}`} />
                </div>
                <Badge variant="secondary" className="bg-muted font-bold">
                  {stat.change}
                </Badge>
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
                <TableRow className="hover:bg-transparent border-muted text-xs font-bold uppercase">
                  <TableHead>Store Name</TableHead>
                  <TableHead className="text-center">Status</TableHead>
                  <TableHead className="text-center">Last Sync</TableHead>
                  <TableHead className="text-right">Total Sales</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {stores.map((store: any) => (
                  <TableRow key={store.id} className="border-muted hover:bg-muted/30">
                    <TableCell className="font-bold py-4">
                      <div className="flex flex-col">
                        <span>{store.name}</span>
                        <span className="text-[10px] font-mono text-muted-foreground">{store.id}</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-center">
                      <div className="flex items-center justify-center gap-2">
                        <Circle className={`h-2 w-2 fill-current ${store.status === "online" ? "text-green-500" : "text-slate-300"}`} />
                        <span className="text-sm capitalize font-medium">{store.status}</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-center text-sm text-muted-foreground">{store.lastSync}</TableCell>
                    <TableCell className="text-right font-black">{store.sales}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

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

          <Card className="border-2 border-destructive/20 shadow-sm bg-destructive/5">
            <CardHeader>
              <CardTitle className="text-xl text-destructive flex items-center gap-2">
                <AlertTriangle className="h-5 w-5" />
                Danger Zone
              </CardTitle>
              <CardDescription>Actions here cannot be undone.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-2">
                <Button 
                  variant="outline" 
                  size="sm"
                  className="text-xs font-bold border-destructive/20 hover:bg-destructive hover:text-white"
                  onClick={() => handleResetClick("sales")}
                >
                  Clear Sales
                </Button>
                <Button 
                  variant="outline" 
                  size="sm"
                  className="text-xs font-bold border-destructive/20 hover:bg-destructive hover:text-white"
                  onClick={() => handleResetClick("logs")}
                >
                  Clear Logs
                </Button>
                <Button 
                  variant="outline" 
                  size="sm"
                  className="text-xs font-bold border-destructive/20 hover:bg-destructive hover:text-white"
                  onClick={() => handleResetClick("inventory")}
                >
                  Clear Inventory
                </Button>
                <Button 
                  variant="outline" 
                  size="sm"
                  className="text-xs font-bold border-destructive/20 hover:bg-destructive hover:text-white"
                  onClick={() => handleResetClick("customers")}
                >
                  Clear Customers
                </Button>
              </div>

              <Button 
                variant="destructive" 
                className="w-full font-bold gap-2"
                onClick={() => handleResetClick("all")}
              >
                <Trash2 className="h-4 w-4" />
                Nuke Everything (Full Reset)
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>

      <ConfirmationModal
        isOpen={resetConfig.isOpen}
        onClose={() => setResetConfig((prev) => ({ ...prev, isOpen: false }))}
        onConfirm={confirmReset}
        title={resetConfig.title}
        description={resetConfig.description}
        variant="destructive"
        confirmText={resetConfig.type === "all" ? "Nuke Everything" : "Confirm Reset"}
      />
    </div>
  );
}
