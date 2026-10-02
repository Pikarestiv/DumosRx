import { useState, useEffect } from "react";
import { checkIfTableExists, getActiveUserCount } from "@/lib/db/queries/setup";
import type { RecentUser } from "@/lib/context/auth-context";
import {
  getRecentUsers,
  setRecentUsers as persistRecentUsers,
} from "@/lib/storage-keys";

// Shared by the merged /login page's login and setup tabs so switching
// between them never re-runs this check or shows a second loading spinner.
// Each used to run this independently (useLogin + useOnboarding both had
// their own copy), which caused a "loading" flash on every tab switch even
// though the underlying answer never changes mid-session.
async function readUserCount(): Promise<number> {
  const exists = await checkIfTableExists("users");
  return exists ? await getActiveUserCount() : 0;
}

export function useDeviceAuthStatus() {
  const [isChecking, setIsChecking] = useState(true);
  const [userCount, setUserCount] = useState(0);
  const [recentUsers, setRecentUsers] = useState<RecentUser[]>([]);

  // Shared by the mount effect below and refetch() (see A-154 in
  // docs/FIXED_BUGS.md), so the two can't drift out of sync with each other.
  const readStatus = async (onCount: (count: number) => void) => {
    try {
      onCount(await readUserCount());
    } catch (e) {
      console.error("Device auth status check failed", e);
    }
    try {
      setRecentUsers(getRecentUsers());
    } catch (e) {
      console.error("Failed to parse recent users", e);
    }
  };

  useEffect(() => {
    let cancelled = false;
    readStatus((count) => {
      if (!cancelled) setUserCount(count);
    }).finally(() => {
      if (!cancelled) setIsChecking(false);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // See docs/FIXED_BUGS.md A-154: forces a fresh read for callers that just
  // changed this device's user data, since the mount effect above never re-runs.
  const refetch = () => readStatus(setUserCount);

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
