import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CardContent, CardFooter } from "@/components/ui/card";
import {
  InputOTP,
  InputOTPGroup,
  InputOTPSlot,
} from "@/components/ui/input-otp";
import { User, Loader2 } from "lucide-react";
import { APP_VERSION } from "@/lib/constants";
import { motion } from "framer-motion";

interface TraditionalLoginFormProps {
  username: string;
  setUsername: (value: string) => void;
  pin: string;
  setPin: (value: string) => void;
  isLoading: boolean;
  hasError?: boolean;
  onSubmit: (e: React.FormEvent) => void;
  onGoToRegister?: () => void;
  onGoToCloud?: () => void;
  onCancel?: () => void;
}

export function TraditionalLoginForm({
  username,
  setUsername,
  pin,
  setPin,
  isLoading,
  hasError = false,
  onSubmit,
  onGoToRegister,
  onGoToCloud,
  onCancel,
}: TraditionalLoginFormProps) {
  return (
    <form onSubmit={onSubmit} className="flex flex-col justify-center">
      <div className="px-10 pb-3 text-center space-y-1.5">
        <h2 className="text-2xl font-bold tracking-tight text-foreground">
          Sign In
        </h2>
        <p className="text-sm text-muted-foreground font-medium">
          Enter your details below to continue
        </p>
      </div>
      <CardContent className="space-y-3 px-10 sm:pt-4">
        <div className="space-y-1.5 w-[276px] mx-auto">
          <Label htmlFor="username" className="text-sm font-medium">
            Username
          </Label>
          <div className="relative group w-full">
            <User className="absolute left-3.5 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground group-focus-within:text-primary transition-colors" />
            <Input
              id="username"
              placeholder="admin"
              className="h-12 w-full pl-11 text-base bg-background/50 border-border focus:border-primary/50 focus:ring-primary/20 transition-all lowercase"
              value={username}
              onChange={(e) => setUsername(e.target.value.toLowerCase())}
              required
            />
          </div>
        </div>
        <div className="space-y-1.5 w-[276px] mx-auto">
          <Label htmlFor="pin" className="text-sm font-medium">
            PIN
          </Label>
          <motion.div
            animate={hasError ? { x: [-10, 10, -10, 10, -5, 5, 0] } : {}}
            transition={{ duration: 0.4 }}
          >
            <InputOTP
              id="pin"
              maxLength={4}
              pattern="^[0-9]+$"
              inputMode="numeric"
              value={pin}
              onChange={(value) => setPin(value)}
            >
              <InputOTPGroup className="gap-3 w-full">
                {[0, 1, 2, 3].map((idx) => (
                  <InputOTPSlot
                    key={idx}
                    index={idx}
                    className="flex-1 min-w-0 h-auto aspect-square text-xl font-semibold rounded-md border border-border bg-background/50 transition-all focus-visible:ring-1 focus-visible:ring-primary focus-visible:border-primary shadow-sm"
                  />
                ))}
              </InputOTPGroup>
            </InputOTP>
          </motion.div>
        </div>
      </CardContent>
      <CardFooter className="flex flex-col space-y-4 pt-4 px-10 pb-6">
        {(onGoToRegister || onGoToCloud) && (
          <div className="flex flex-wrap items-center justify-center gap-x-2 gap-y-1 text-center text-sm text-muted-foreground">
            {onGoToRegister && (
              <button
                type="button"
                onClick={onGoToRegister}
                className="text-primary hover:underline font-semibold animate-pulse hover:animate-none bg-transparent border-0 p-0 cursor-pointer"
              >
                Create account
              </button>
            )}
            {onGoToRegister && onGoToCloud && (
              <span className="text-muted-foreground/40">•</span>
            )}
            {onGoToCloud && (
              <button
                type="button"
                onClick={onGoToCloud}
                className="text-primary hover:underline font-semibold animate-pulse hover:animate-none bg-transparent border-0 p-0 cursor-pointer"
              >
                Cloud Setup
              </button>
            )}
          </div>
        )}
        <Button
          type="submit"
          className="h-11 text-base font-bold shadow-lg active:scale-[0.98] w-[276px] mx-auto"
          disabled={isLoading}
        >
          {!!isLoading && <Loader2 className="mr-2 h-5 w-5 animate-spin" />}
          {!isLoading && "Authorize Entry"}
        </Button>
        {onCancel && (
          <Button
            type="button"
            variant="outline"
            className="h-11 text-base font-medium w-[276px] mx-auto"
            onClick={onCancel}
            disabled={isLoading}
          >
            Cancel
          </Button>
        )}
        {/* <div className="flex items-center gap-2 text-[10px] text-muted-foreground uppercase tracking-widest">
          <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
          System Online • Encrypted Session
        </div> */}
        {/* <div className="flex justify-center w-full mt-2 border-t border-border pt-3">
          <span className="text-[10px] text-muted-foreground font-medium">
            v{APP_VERSION}
          </span>
        </div> */}
      </CardFooter>
    </form>
  );
}
