"use client";

import { useState } from "react";
import { useAuth } from "@/lib/context/auth-context";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Pill, Lock, User, Loader2 } from "lucide-react";
import { APP_NAME } from "@/lib/constants";
import { toast } from "sonner";

export default function LoginPage() {
  const [username, setUsername] = useState("");
  const [pin, setPin] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const { login } = useAuth();
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    
    try {
      const success = await login(username, pin);
      if (success) {
        toast.success("Welcome back!");
        router.push("/dashboard");
      } else {
        toast.error("Invalid credentials. Try 'admin' to start.");
      }
    } catch (error) {
      toast.error("Login failed. Database might not be initialized.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/30 p-4">
      <Card className="w-full max-w-md shadow-xl border-accent/20">
        <CardHeader className="space-y-1 flex flex-col items-center text-center">
          <div className="h-12 w-12 bg-accent rounded-xl flex items-center justify-center mb-4 shadow-lg shadow-accent/20">
            <Pill className="h-7 w-7 text-white" />
          </div>
          <CardTitle className="text-3xl font-serif font-black">{APP_NAME}</CardTitle>
          <CardDescription>Enter your credentials to access the system</CardDescription>
        </CardHeader>
        <form onSubmit={handleSubmit}>
          <CardContent className="space-y-4 pt-4">
            <div className="space-y-2">
              <Label htmlFor="username">Username</Label>
              <div className="relative">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input 
                  id="username" 
                  placeholder="admin" 
                  className="pl-10"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  required 
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="pin">PIN / Password (Optional)</Label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input 
                  id="pin" 
                  type="password" 
                  placeholder="••••" 
                  className="pl-10"
                  value={pin}
                  onChange={(e) => setPin(e.target.value)}
                />
              </div>
            </div>
          </CardContent>
          <CardFooter className="flex flex-col space-y-4 pt-6">
            <Button type="submit" className="w-full h-11 text-lg font-bold" disabled={isLoading}>
              {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : "Sign In"}
            </Button>
            <p className="text-xs text-center text-muted-foreground">
              Tip: Use <strong>admin</strong> to sign in if this is your first time.
            </p>
          </CardFooter>
        </form>
      </Card>
    </div>
  );
}
