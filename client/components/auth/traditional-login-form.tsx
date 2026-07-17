import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CardContent, CardFooter } from "@/components/ui/card";
import { Lock, User, Loader2 } from "lucide-react";
import { APP_VERSION } from "@/lib/constants";

interface TraditionalLoginFormProps {
  username: string;
  setUsername: (value: string) => void;
  pin: string;
  setPin: (value: string) => void;
  isLoading: boolean;
  onSubmit: (e: React.FormEvent) => void;
}

export function TraditionalLoginForm({
  username,
  setUsername,
  pin,
  setPin,
  isLoading,
  onSubmit,
}: TraditionalLoginFormProps) {
  return (
    <form onSubmit={onSubmit} className="flex-1 flex flex-col justify-center">
      <div className="sm:hidden px-6 pt-10 pb-2 text-center space-y-1.5">
        <h2 className="text-2xl font-bold tracking-tight text-foreground">Sign In</h2>
        <p className="text-sm text-muted-foreground font-medium">Enter your details below to continue</p>
      </div>
      <CardContent className="space-y-3 sm:pt-4">
        <div className="space-y-1.5">
          <Label htmlFor="username" className="text-sm font-medium">
            Username
          </Label>
          <div className="relative group">
            <User className="absolute left-3.5 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground group-focus-within:text-primary transition-colors" />
            <Input
              id="username"
              placeholder="admin"
              className="h-12 pl-11 text-base bg-background/50 border-border focus:border-primary/50 focus:ring-primary/20 transition-all lowercase"
              value={username}
              onChange={(e) => setUsername(e.target.value.toLowerCase())}
              required
            />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="pin" className="text-sm font-medium">
            PIN
          </Label>
          <div className="relative group">
            <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground group-focus-within:text-primary transition-colors" />
            <Input
              id="pin"
              type="password"
              placeholder="••••"
              className="h-12 pl-11 text-base bg-background/50 border-border focus:border-primary/50 focus:ring-primary/20 transition-all"
              value={pin}
              onChange={(e) => setPin(e.target.value)}
              required
            />
          </div>
        </div>

        <div className="pt-1 text-center text-xs text-muted-foreground flex flex-col items-center gap-1">
          <span>Moving from another device?</span>
          <div className="flex items-center gap-2">
            <Link
              href="/setup?step=backup&from=login"
              className="font-semibold hover:underline hover:text-primary transition-colors"
            >
              Restore from Backup
            </Link>
            <span>•</span>
            <Link
              href="/setup?step=cloud&from=login"
              className="font-semibold hover:underline hover:text-primary transition-colors"
            >
              Sync from Cloud
            </Link>
          </div>
        </div>
      </CardContent>
      <CardFooter className="flex flex-col space-y-4 pt-4 pb-6">
        <Button
          type="submit"
          className="w-full h-11 text-base font-bold shadow-lg active:scale-[0.98]"
          disabled={isLoading}
        >
          {isLoading ? (
            <Loader2 className="mr-2 h-5 w-5 animate-spin" />
          ) : (
            "Authorize Entry"
          )}
        </Button>
        <div className="flex items-center gap-2 text-[10px] text-muted-foreground uppercase tracking-widest">
          <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
          System Online • Encrypted Session
        </div>
        <div className="flex justify-center w-full mt-2 border-t border-border pt-3">
          <span className="text-[10px] text-muted-foreground font-medium">
            v{APP_VERSION}
          </span>
        </div>
      </CardFooter>
    </form>
  );
}
