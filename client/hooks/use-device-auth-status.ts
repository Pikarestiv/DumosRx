import { useState, useEffect } from "react";
import { checkIfTableExists, getActiveUserCount } from "@/lib/db/queries/setup";
import type { RecentUser } from "@/lib/context/auth-context";
import {
  getRecentUsers,
  setRecentUsers as persistRecentUsers,
} from "@/lib/storage-keys";

// Shared by the merged /login page's login and setup tabs so switching between them never re-runs this check or shows a se…
// Rationale: docs/CLIENT_COMMENTS.md#line-hooks-use-device-auth-status-ts-L9
async function readUserCount(): Promise<number> {
  const exists = await checkIfTableExists("users");
  return exists ? await getActiveUserCount() : 0;
}

interface DeviceAuthStatus {
  userCount?: number;
  recentUsers?: RecentUser[];
}

async function loadDeviceAuthStatus(): Promise<DeviceAuthStatus> {
  const status: DeviceAuthStatus = {};
  try {
    status.userCount = await readUserCount();
  } catch (e) {
    console.error("Device auth status check failed", e);
  }
  try {
    status.recentUsers = getRecentUsers();
  } catch (e) {
    console.error("Failed to parse recent users", e);
  }
  return status;
}

export function useDeviceAuthStatus() {
  const [isChecking, setIsChecking] = useState(true);
  const [userCount, setUserCount] = useState(0);
  const [recentUsers, setRecentUsers] = useState<RecentUser[]>([]);

  const applyStatus = (status: DeviceAuthStatus) => {
    if (status.userCount !== undefined) setUserCount(status.userCount);
    if (status.recentUsers) setRecentUsers(status.recentUsers);
  };

  useEffect(() => {
    let cancelled = false;
    void loadDeviceAuthStatus().then((status) => {
      if (cancelled) return;
      applyStatus(status);
      setIsChecking(false);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // See docs/FIXED_BUGS.md A-154: forces a fresh read for callers that just
  // changed this device's user data, since the mount effect above never re-runs.
  const refetch = async () => applyStatus(await loadDeviceAuthStatus());

  const removeRecentUser = (id: string) => {
    const next = recentUsers.filter((u) => u.id !== id);
    setRecentUsers(next);
    try {
      persistRecentUsers(next);
    } catch (e) {
      console.error("Failed to persist recent users", e);
    }
  };

  return { isChecking, userCount, recentUsers, removeRecentUser, refetch };
}
