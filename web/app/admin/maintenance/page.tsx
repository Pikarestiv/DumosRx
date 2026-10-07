"use client";

import Link from "next/link";
import { ShieldAlert, Wrench } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAdminAuthStore, checkIsSuperAdmin } from "@/lib/store/use-admin-auth-store";
import { useApiEnvironmentName } from "@/hooks/use-api-environment";
import { Badge } from "@/components/ui/badge";
import { PendingMigrationsPanel } from "@/components/admin/maintenance/pending-migrations-panel";
import { RolesSyncPanel } from "@/components/admin/maintenance/roles-sync-panel";

function NotAvailable() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4 text-center">
      <div className="p-4 bg-muted text-muted-foreground rounded-full">
        <ShieldAlert className="h-10 w-10" />
      </div>
      <div>
        <p className="font-bold text-foreground">
          This page is only available to super admins
        </p>
        <p className="text-sm text-muted-foreground mt-1">
          Maintenance applies schema changes to production, so it is restricted.
        </p>
      </div>
      <Button asChild variant="outline">
        <Link href="/admin">Back to Overview</Link>
      </Button>
    </div>
  );
}

export default function MaintenancePage() {
  const { user } = useAdminAuthStore();

  if (!checkIsSuperAdmin(user?.role)) {
    return <NotAvailable />;
  }

  return <MaintenanceContent />;
}

function MaintenanceContent() {
  const { environmentName, isProduction } = useApiEnvironmentName();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-black tracking-tight flex items-center gap-2">
          <Wrench className="h-8 w-8 text-indigo-500" />
          Maintenance
          <Badge
            variant={isProduction ? "destructive" : "secondary"}
            className="text-xs align-middle"
          >
            {environmentName}
          </Badge>
        </h1>
        <p className="text-muted-foreground mt-1">
          {`Every action here applies to the ${isProduction ? "production" : environmentName} database this session is connected to.`}
        </p>
      </div>

      <PendingMigrationsPanel />
      <RolesSyncPanel />
    </div>
  );
}
