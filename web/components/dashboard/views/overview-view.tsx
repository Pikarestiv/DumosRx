"use client";

import { useState } from "react";
import { StoreModal } from "@/components/dashboard/store-modal";
import { 
  Plus,
  Store,
  Circle,
  AlertTriangle,
  Mail
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { SubscriptionWrapper } from "@/components/dashboard/subscription-wrapper";
import { toast } from "sonner";
import { useSubscriptionStatus } from "@/lib/api/hooks";
import { webApiClient } from "@/lib/api/client";
import { OverviewStats } from "./overview-stats";
import { OverviewDangerZone } from "./overview-danger-zone";

interface OverviewViewProps {
  stats: any;
  user: any;
  stores: any[];
  onReset: (type: string) => Promise<any>;
  onNavigate?: (tab: string) => void;
}

export function OverviewView({ stats, user, stores, onReset, onNavigate: _onNavigate }: OverviewViewProps) {
  const { data: subscription } = useSubscriptionStatus();
  
  const syncInterval = subscription?.limits?.sync_interval ?? 0;
  const isDelayedSync = syncInterval > 0;
  
  // We link the daily summary to the auto_backup / smart_suggestions tier
  const canSendSummary = subscription?.features?.auto_backup ?? (subscription?.plan !== 'starter' && subscription?.plan !== 'free');
  
  const [isStoreModalOpen, setIsStoreModalOpen] = useState(false);
  const [isSendingSummary, setIsSendingSummary] = useState(false);

  const handleSendSummary = async () => {
    try {
      setIsSendingSummary(true);
      const res = await webApiClient.sendEndOfDaySummary();
      toast.success(res.message || "Summary sent successfully!");
    } catch (error: any) {
      toast.error(error?.response?.data?.message || "Failed to send summary");
    } finally {
      setIsSendingSummary(false);
    }
  };



  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <StoreModal 
        isOpen={isStoreModalOpen} 
        onClose={() => setIsStoreModalOpen(false)} 
        onSuccess={() => {}} 
      />
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl sm:text-3xl font-black tracking-tight">Cloud Overview</h1>
          <p className="text-muted-foreground">
            Unified insights for <span className="font-bold text-foreground">{user.store_name}</span>
          </p>
        </div>
        <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
          {canSendSummary && (
            <Button 
              variant="outline" 
              className="font-bold w-full sm:w-auto" 
              onClick={handleSendSummary} 
              disabled={isSendingSummary}
            >
              <Mail className="h-4 w-4 mr-2" />
              {isSendingSummary ? "Sending..." : "Send Daily Summary"}
            </Button>
          )}
          <Button id="tour-overview-add-store" className="font-bold w-full sm:w-auto" onClick={() => setIsStoreModalOpen(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Add New Store
          </Button>
        </div>
      </div>

      {isDelayedSync && (
        <div className="bg-amber-500/10 border border-amber-500/20 text-amber-800 dark:text-amber-200 p-4 rounded-xl flex items-start gap-3">
          <AlertTriangle className="h-5 w-5 mt-0.5 shrink-0 text-amber-500" />
          <div className="space-y-1">
            <p className="font-semibold text-amber-800 dark:text-amber-300">Delayed Dashboard Data</p>
            <p className="text-sm opacity-90 text-amber-700 dark:text-amber-200">
              Your current plan synchronizes cloud dashboard metrics every {syncInterval >= 60 ? Math.floor(syncInterval / 60) + ' hours' : syncInterval + ' minutes'}. Upgrade your plan for real-time reporting.
            </p>
          </div>
        </div>
      )}

      <div id="tour-overview-stats">
        <OverviewStats stats={stats} />
      </div>

      <div className="grid lg:grid-cols-3 gap-8">
        <Card id="tour-overview-stores" className="lg:col-span-2 border-none shadow-sm min-w-0 overflow-hidden">
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle>Connected Stores</CardTitle>
              <CardDescription>Real-time sync status for your local store instances.</CardDescription>
            </div>
            <Button variant="ghost" size="sm" className="font-bold">View All</Button>
          </CardHeader>
          <CardContent className="p-0 sm:p-6">
            {!stores || stores.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
                <div className="h-16 w-16 rounded-full bg-muted flex items-center justify-center mb-4">
                  <Store className="h-8 w-8 text-muted-foreground" />
                </div>
                <h3 className="text-xl font-bold tracking-tight">No connected stores</h3>
                <p className="text-sm text-muted-foreground mt-2 mb-6 max-w-sm">
                  Get started by connecting your first terminal to sync data, track performance, and manage your inventory.
                </p>
                <Button className="font-bold" onClick={() => setIsStoreModalOpen(true)}>
                  <Plus className="h-4 w-4 mr-2" />
                  Add First Store
                </Button>
              </div>
            ) : (
              <Table className="min-w-[600px]">
                <TableHeader>
                  <TableRow className="hover:bg-transparent border-muted text-xs font-bold uppercase">
                    <TableHead className="pl-6">Store Name</TableHead>
                    <TableHead className="text-center">Status</TableHead>
                    <TableHead className="text-center">Last Sync</TableHead>
                    <TableHead className="text-right pr-6">Total Sales</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {stores.map((store: any) => (
                    <TableRow key={store.id} className="border-muted hover:bg-muted/30">
                      <TableCell className="font-bold py-4 pl-6">
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
                      <TableCell className="text-right font-black pr-6">{store.sales}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
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
                  <span>{stats?.cloud_storage?.used_gb || 0} GB / {stats?.cloud_storage?.limit_gb || 10} GB</span>
                  <span>{stats?.cloud_storage?.percentage || 0}%</span>
                </div>
                <div className="h-2 bg-white/20 rounded-full overflow-hidden">
                  <div className="h-full bg-white" style={{ width: `${stats?.cloud_storage?.percentage || 0}%` }} />
                </div>
              </div>
            </CardContent>
          </Card>

          <OverviewDangerZone onReset={onReset} />
        </div>
      </div>
    </div>
  );
}
