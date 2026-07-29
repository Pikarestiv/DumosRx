import * as React from "react";
import { RecentUser } from "@/lib/context/auth-context";
import { getUserInitials } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { ArrowLeft, Loader2 } from "lucide-react";
import { motion } from "framer-motion";
import {
  InputOTP,
  InputOTPGroup,
  InputOTPSlot,
} from "@/components/ui/input-otp";
import { PinPad } from "@/components/ui/pin-pad";
import { useIsTouchDevice } from "@/lib/hooks/use-is-touch-device";

interface PinEntryProps {
  selectedUser: RecentUser;
  pin: string;
  setPin: (val: string) => void;
  isLoading: boolean;
  hasError: boolean;
  handleLogin: (e: React.FormEvent) => void;
  onAutoSubmit: (pinValue: string) => void;
  onBack: () => void;
}

export function PinEntry({
  selectedUser,
  pin,
  setPin,
  isLoading,
  hasError,
  handleLogin,
  onAutoSubmit,
  onBack,
}: PinEntryProps) {
  // Touch capability decides this, not viewport width or user-agent sniffing:
  // iPadOS masks its UA to look like a Mac by default, and a tablet can easily
  // have a "desktop-width" viewport in landscape. Real touch devices get the
  // on-screen PinPad (which never depends on the OS actually deciding to show
  // a keyboard); everything else gets the native keyboard via inputMode.
  const isTouchDevice = useIsTouchDevice();

  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 20 }}
      className="flex-1 flex flex-col justify-between sm:justify-start sm:gap-y-6"
    >
      <div className="flex flex-col items-center mb-4 gap-y-2 sm:gap-y-5 pb-0 sm:pb-2">
        <Avatar className="h-12 w-12 sm:h-16 sm:w-16 shadow-md ring-1 ring-border/50">
          <AvatarFallback className="bg-primary/10 text-primary text-xl font-medium">
            {getUserInitials(selectedUser.first_name, selectedUser.last_name)}
          </AvatarFallback>
        </Avatar>

        <div className="text-center gap-y-1">
          <h2 className="text-xl font-semibold text-foreground">
            Welcome back, {selectedUser.first_name}
          </h2>
          <p className="text-sm font-medium text-muted-foreground">
            Enter your PIN to unlock
          </p>
        </div>
      </div>

      <form
        onSubmit={handleLogin}
        className="flex-1 flex flex-col justify-end sm:justify-start space-y-4 sm:space-y-4"
      >
        <div className="flex-1 flex flex-col justify-center sm:block sm:space-y-2">
          <Label htmlFor="pin" className="sr-only">
            PIN
          </Label>
          <motion.div
            className="flex justify-center mb-0 sm:mb-6"
            animate={hasError ? { x: [-10, 10, -10, 10, -5, 5, 0] } : {}}
            transition={{ duration: 0.4 }}
          >
            <InputOTP
              maxLength={4}
              pattern="^[0-9]+$"
              value={pin}
              onChange={(value) => {
                setPin(value);
              }}
              onComplete={(value) => onAutoSubmit(value)}
              autoFocus
              inputMode={isTouchDevice ? "none" : "numeric"}
              containerClassName="gap-2"
            >
              <InputOTPGroup className="gap-2 sm:gap-3 w-full max-w-[280px] justify-center mx-auto">
                {[0, 1, 2, 3].map((idx) => (
                  <InputOTPSlot
                    key={idx}
                    index={idx}
                    className="flex-1 min-w-0 h-auto aspect-square max-w-[56px] text-2xl sm:text-3xl font-semibold rounded-xl border border-border/60 shadow-sm transition-all focus-visible:ring-1 focus-visible:ring-primary focus-visible:border-primary"
                  />
                ))}
              </InputOTPGroup>
            </InputOTP>
          </motion.div>
          {isLoading && (
            <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Verifying...
            </div>
          )}
        </div>

        {isTouchDevice && (
          <div className="mt-auto mb-3">
            <PinPad
              value={pin}
              onChange={setPin}
              maxLength={4}
              onSubmit={onAutoSubmit}
            />
          </div>
        )}

        <div className="pt-1 pb-2 sm:pt-4 sm:pb-0">
          <Button
            type="button"
            variant="outline"
            className="w-full h-11 rounded-lg border-border font-medium hover:bg-muted/50 hover:text-foreground hover:font-bold"
            onClick={onBack}
            disabled={isLoading}
          >
            <ArrowLeft className="mr-2 h-4 w-4" /> Back
          </Button>
        </div>
      </form>
    </motion.div>
  );
}
