"use client";

import { Database, CloudOff, Save, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";

interface DataSettingsProps {
  isCloudLinked: boolean;
  handleSync: () => void;
  setIsCloudLinkOpen: (val: boolean) => void;
  handleDownloadBackup: () => void;
  handleRestoreBackup: (e: React.ChangeEvent<HTMLInputElement>) => void;
  handleResetDatabase: () => void;
}

export function DataSettings({
  isCloudLinked,
  handleSync,
  setIsCloudLinkOpen,
  handleDownloadBackup,
  handleRestoreBackup,
  handleResetDatabase,
}: DataSettingsProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Data Synchronization</CardTitle>
        <CardDescription>
          Manage offline data and cloud backups.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between p-4 border rounded-lg bg-muted/30 gap-4">
          <div className="flex items-center gap-3">
            <div
              className={`h-10 w-10 ${isCloudLinked ? "bg-green-100 text-green-600" : "bg-amber-100 text-amber-600"} rounded-full flex items-center justify-center`}
            >
              {isCloudLinked ? (
                <Database className="h-5 w-5" />
              ) : (
                <CloudOff className="h-5 w-5" />
              )}
            </div>
            <div>
              <p className="font-medium">
                {isCloudLinked
                  ? "Connected to Cloud"
                  : "Local Mode (Not Linked)"}
              </p>
              <p className="text-sm text-muted-foreground">
                {isCloudLinked
                  ? `Last synced: ${localStorage.getItem("last_sync_time") ? new Date(localStorage.getItem("last_sync_time")!).toLocaleString() : "Never"}`
                  : "Connect your cloud account to enable sync"}
              </p>
            </div>
          </div>
          <div className="flex gap-2">
            {!isCloudLinked && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setIsCloudLinkOpen(true)}
              >
                Link Account
              </Button>
            )}
            <Button
              variant={isCloudLinked ? "outline" : "default"}
              size="sm"
              onClick={handleSync}
            >
              {isCloudLinked ? "Sync Now" : "Link & Sync"}
            </Button>
          </div>
        </div>

        <Separator />

        <div className="space-y-4">
          <h3 className="font-medium">Backup & Restore</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Button
              variant="outline"
              className="w-full justify-start cursor-pointer"
              onClick={handleDownloadBackup}
            >
              <Save className="w-4 h-4 mr-2" />
              Download Local Backup
            </Button>
            <div className="relative">
              <Button
                variant="outline"
                className="w-full justify-start cursor-pointer"
                asChild
              >
                <label htmlFor="restore-db">
                  <Upload className="w-4 h-4 mr-2" />
                  Restore from File
                </label>
              </Button>
              <input
                type="file"
                id="restore-db"
                className="hidden"
                accept=".drx"
                onChange={handleRestoreBackup}
              />
            </div>
          </div>
        </div>

        <Separator />

        <div className="space-y-4">
          <h3 className="font-medium text-destructive">
            Danger Zone
          </h3>
          <div className="p-4 border border-destructive/20 rounded-lg bg-destructive/5 flex flex-col md:flex-row items-center justify-between gap-4">
            <div className="space-y-1">
              <p className="text-sm font-semibold">Factory Reset</p>
              <p className="text-xs text-muted-foreground">
                Wipe all local data (medicines, sales, etc.) and start
                fresh.
              </p>
            </div>
            <Button
              variant="destructive"
              size="sm"
              onClick={handleResetDatabase}
            >
              Reset All Data
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
