import { useState } from "react";
import { isTillInspectionSession } from "@/lib/utils/till-inspection";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { useAuth } from "@/lib/context/auth-context";

// Device/account status (userCount, recentUsers, isChecking) now lives in useDeviceAuthStatus, shared with the setup tab o…
// Rationale: docs/CLIENT_COMMENTS.md#line-hooks-use-login-ts-L7
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
        // Left `isLoading` true:
        // Rationale: docs/CLIENT_COMMENTS.md#line-hooks-use-login-ts-L28
        router.push(isTillInspectionSession() ? "/inspect" : "/dashboard");
      } else {
        setPin("");
        setHasError(true);
        setTimeout(() => setHasError(false), 500);
        toast.error("Invalid credentials. Please try again.");
        setIsLoading(false);
      }
    } catch (err) {
      // Surfaces the real failure (e.g.
      // Rationale: docs/CLIENT_COMMENTS.md#line-hooks-use-login-ts-L42
      toast.error(
        err instanceof Error ? err.message : "Login failed. Database might not be initialized.",
      );
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
