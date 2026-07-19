import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { useAuth, RecentUser } from "@/lib/context/auth-context";
import { checkIfTableExists, getActiveUserCount } from "@/lib/db/queries/setup";

export function useLogin() {
  const [username, setUsername] = useState("");
  const [pin, setPin] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isCheckingStatus, setIsCheckingStatus] = useState(true);
  const [userCount, setUserCount] = useState(0);
  const [recentUsers, setRecentUsers] = useState<RecentUser[]>([]);
  const [showTraditionalLogin, setShowTraditionalLogin] = useState(false);

  const { login } = useAuth();
  const router = useRouter();

  useEffect(() => {
    checkStatus();
    const storedUsers = localStorage.getItem("dumos_recent_users");
    if (storedUsers) {
      try {
        setRecentUsers(JSON.parse(storedUsers));
      } catch (e) {
        console.error("Failed to parse recent users", e);
      }
    }
  }, []);

  const checkStatus = async () => {
    try {
      const exists = await checkIfTableExists("users");
      if (!exists) {
        setUserCount(0);
        return;
      }

      const count = await getActiveUserCount();
      setUserCount(count);
    } catch (e) {
      console.error("Status check failed", e);
    } finally {
      setIsCheckingStatus(false);
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    try {
      const cleanUsername = username.trim().toLowerCase();
      const success = await login(cleanUsername, pin);
      if (success) {
        toast.success("Welcome back!");
        router.push("/dashboard");
      } else {
        toast.error("Invalid credentials. Please try again.");
      }
    } catch {
      toast.error("Login failed. Database might not be initialized.");
    } finally {
      setIsLoading(false);
    }
  };

  return {
    username,
    setUsername,
    pin,
    setPin,
    isLoading,
    isCheckingStatus,
    userCount,
    recentUsers,
    showTraditionalLogin,
    setShowTraditionalLogin,
    handleLogin,
  };
}
