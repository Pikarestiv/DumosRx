"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { useAuth, type RecentUser } from "@/lib/context/auth-context";
import { useAutoLockStore } from "@/lib/hooks/use-auto-lock";
import { LockScreen } from "@/components/auth/lock-screen";
import { AuthCardShell } from "@/components/auth/auth-card-shell";
import {
  getRecentUsers,
  setRecentUsers as persistRecentUsers,
} from "@/lib/storage-keys";
import { useHydrated } from "@/lib/hooks/use-hydrated";
import { navigateWithFullReload } from "@/lib/utils/full-page-navigate";

function readRecentUsers(): RecentUser[] {
  try {
    return getRecentUsers();
  } catch {
    return [];
  }
}

export function DashboardLockOverlay() {
  const { user } = useAuth();
  const isLocked = useAutoLockStore((s) => s.isLocked);
  const forceAccountSelection = useAutoLockStore(
    (s) => s.forceAccountSelection,
  );
  const unlock = useAutoLockStore((s) => s.unlock);
  const hydrated = useHydrated();
  const [editedRecentUsers, setRecentUsers] = useState<RecentUser[] | null>(null);
  const recentUsers = editedRecentUsers ?? (hydrated ? readRecentUsers() : []);

  const handleRemoveRecentUser = (id: string) => {
    const next = recentUsers.filter((u) => u.id !== id);
    setRecentUsers(next);
    try {
      persistRecentUsers(next);
    } catch (e) {
      console.error("Failed to persist recent users", e);
    }
  };

  if (!isLocked) return null;

  return (
    <div
      // Must stay below TauriTitleBar's z-[9999], or this full-viewport
      // background paints over the window controls.
      className="fixed inset-0 z-[9000] bg-background flex flex-col items-center justify-center p-0 sm:p-4 overflow-y-auto"
      style={{
        paddingTop:
          "calc(var(--tauri-top, env(safe-area-inset-top, 0px)) + 1rem)",
        paddingBottom:
          "calc(var(--tauri-bottom, env(safe-area-inset-bottom, 0px)) + 1rem)",
      }}
    >
      <div className="absolute inset-0 z-0">
        <div className="absolute inset-0 bg-gradient-to-b from-transparent to-background/60" />
      </div>

      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.5 }}
        className="w-full h-[100dvh] sm:h-auto sm:max-w-md z-10 flex flex-col sm:justify-center"
      >
        <AuthCardShell variant="overlay">
          <div className="flex-1 flex flex-col pt-1 pb-0 px-4 sm:py-6 sm:px-6">
            <LockScreen
              key={forceAccountSelection ? "select" : "default"}
              recentUsers={recentUsers}
              onRemoveRecentUser={handleRemoveRecentUser}
              defaultUser={
                !forceAccountSelection && user
                  ? { ...user, last_login: new Date().toISOString() }
                  : undefined
              }
              onLoginAsOther={() => navigateWithFullReload("/login?mode=new")}
              onSetUpNewDevice={() =>
                navigateWithFullReload("/login?tab=setup&step=cloud")
              }
              onUnlockSuccess={() => unlock()}
            />
          </div>
        </AuthCardShell>
      </motion.div>
    </div>
  );
}
