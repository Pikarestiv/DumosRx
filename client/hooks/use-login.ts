import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { useAuth } from "@/lib/context/auth-context";

// Device/account status (userCount, recentUsers, isChecking) now lives in
// useDeviceAuthStatus, shared with the setup tab on the merged /login page —
// this hook only owns the login form itself.
export function useLogin() {
  const [username, setUsername] = useState("");
  const [pin, setPin] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [showTraditionalLogin, setShowTraditionalLogin] = useState(false);

  const { login } = useAuth();
  const router = useRouter();

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
    showTraditionalLogin,
    setShowTraditionalLogin,
    handleLogin,
  };
}
