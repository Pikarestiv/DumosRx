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
  const [hasError, setHasError] = useState(false);

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
        // Left `isLoading` true — router.push() doesn't await the route
        // transition, so resetting it here would flip the form back to its
        // idle state for one frame while /dashboard is still loading.
        router.push("/dashboard");
      } else {
        setPin("");
        setHasError(true);
        setTimeout(() => setHasError(false), 500);
        toast.error("Invalid credentials. Please try again.");
        setIsLoading(false);
      }
    } catch {
      toast.error("Login failed. Database might not be initialized.");
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
    hasError,
    handleLogin,
  };
}
