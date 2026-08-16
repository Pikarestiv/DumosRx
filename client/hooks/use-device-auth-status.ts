import { useState, useEffect } from "react";
import { checkIfTableExists, getActiveUserCount } from "@/lib/db/queries/setup";
import type { RecentUser } from "@/lib/context/auth-context";

// Shared by the merged /login page's login and setup tabs so switching
// between them never re-runs this check or shows a second loading spinner —
// each used to run this independently (useLogin + useOnboarding both had
// their own copy), which is exactly what caused a "loading" flash on every
// tab switch even though the underlying answer never changes mid-session.
export function useDeviceAuthStatus() {
  const [isChecking, setIsChecking] = useState(true);
  const [userCount, setUserCount] = useState(0);
  const [recentUsers, setRecentUsers] = useState<RecentUser[]>([]);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const exists = await checkIfTableExists("users");
        const count = exists ? await getActiveUserCount() : 0;
        if (!cancelled) setUserCount(count);
      } catch (e) {
        console.error("Device auth status check failed", e);
      } finally {
        if (!cancelled) setIsChecking(false);
      }
    })();

    try {
      const storedUsers = localStorage.getItem("dumos_recent_users");
      if (storedUsers) setRecentUsers(JSON.parse(storedUsers));
    } catch (e) {
      console.error("Failed to parse recent users", e);
    }

    return () => {
      cancelled = true;
    };
  }, []);

  return { isChecking, userCount, recentUsers };
}
