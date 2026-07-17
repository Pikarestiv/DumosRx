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

interface PinEntryProps {
  selectedUser: RecentUser;
  pin: string;
  setPin: (val: string) => void;
  isLoading: boolean;
  hasError: boolean;
  handleLogin: (e: React.FormEvent) => void;
  onBack: () => void;
}

export function PinEntry({
  selectedUser,
  pin,
  setPin,
  isLoading,
  hasError,
  handleLogin,
  onBack,
}: PinEntryProps) {
  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 20 }}
      className="flex-1 flex flex-col justify-between sm:justify-start sm:space-y-6"
    >
      <div className="flex flex-col items-center space-y-2 sm:space-y-5 pt-2 sm:pt-0 pb-0 sm:pb-2">
        <Avatar className="h-12 w-12 sm:h-16 sm:w-16 shadow-md ring-1 ring-border/50">
          <AvatarFallback className="bg-primary/10 text-primary text-xl font-medium">
            {getUserInitials(selectedUser.first_name, selectedUser.last_name)}
          </AvatarFallback>
        </Avatar>
        <div className="text-center space-y-1">
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
        className="flex-1 flex flex-col justify-end sm:justify-start space-y-2 sm:space-y-4"
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
              onComplete={() => {
                // We don't auto-submit here because handleLogin expects an event,
                // but we can simulate it or just let the button do it.
              }}
              autoFocus
              inputMode="none"
              className="md:input-mode-numeric"
              containerClassName="gap-2"
            >
              <InputOTPGroup className="gap-2 sm:gap-3">
                <InputOTPSlot
                  index={0}
                  className="w-12 h-14 sm:w-14 sm:h-16 text-2xl font-semibold rounded-xl border border-border/60 shadow-sm transition-all focus-visible:ring-1 focus-visible:ring-primary focus-visible:border-primary"
                />
                <InputOTPSlot
                  index={1}
                  className="w-12 h-14 sm:w-14 sm:h-16 text-2xl font-semibold rounded-xl border border-border/60 shadow-sm transition-all focus-visible:ring-1 focus-visible:ring-primary focus-visible:border-primary"
                />
                <InputOTPSlot
                  index={2}
                  className="w-12 h-14 sm:w-14 sm:h-16 text-2xl font-semibold rounded-xl border border-border/60 shadow-sm transition-all focus-visible:ring-1 focus-visible:ring-primary focus-visible:border-primary"
                />
                <InputOTPSlot
                  index={3}
                  className="w-12 h-14 sm:w-14 sm:h-16 text-2xl font-semibold rounded-xl border border-border/60 shadow-sm transition-all focus-visible:ring-1 focus-visible:ring-primary focus-visible:border-primary"
                />
              </InputOTPGroup>
            </InputOTP>
          </motion.div>
        </div>

        <div className="md:hidden mt-auto mb-1">
          <PinPad value={pin} onChange={setPin} maxLength={4} />
        </div>

        <div className="grid grid-cols-2 gap-3 pt-1 pb-2 sm:pt-4 sm:pb-0">
          <Button
            type="button"
            variant="outline"
            className="h-11 rounded-lg border-border/60 font-medium hover:bg-muted/50"
            onClick={onBack}
            disabled={isLoading}
          >
            <ArrowLeft className="mr-2 h-4 w-4" /> Back
          </Button>
          <Button
            type="submit"
            className="h-11 rounded-lg font-medium shadow-sm transition-all hover:shadow-md"
            disabled={isLoading || pin.length < 4}
          >
            {isLoading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              "Unlock"
            )}
          </Button>
        </div>
      </form>
    </motion.div>
  );
}
