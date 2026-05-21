import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { webApiClient } from "@/lib/api/client";
import { toast } from "sonner";
import { motion } from "framer-motion";
import { Shield, Key, Save, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export function TerminalPinForm() {
  const [pinData, setPinData] = useState({
    pin: "",
  });

  const pinMutation = useMutation({
    mutationFn: (pin: string) => webApiClient.setPin(pin),
    onSuccess: () => {
      toast.success("Security PIN updated successfully");
      setPinData({ pin: "" });
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.message || "Failed to update PIN");
    },
  });

  const handleUpdatePin = (e: React.FormEvent) => {
    e.preventDefault();
    if (pinData.pin.length !== 4) {
      toast.error("PIN must be 4 digits");
      return;
    }
    pinMutation.mutate(pinData.pin);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: 0.1 }}
    >
      <Card className="h-full bg-card/50 backdrop-blur-sm border-border/50">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5 text-primary" />
            Terminal Security
          </CardTitle>
          <CardDescription>
            Set a 4-digit PIN for quick access to the Desktop/Mobile app.
          </CardDescription>
        </CardHeader>
        <form onSubmit={handleUpdatePin}>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="pin">4-Digit PIN</Label>
              <div className="relative">
                <Key className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  id="pin"
                  type="password"
                  maxLength={4}
                  value={pinData.pin}
                  onChange={(e) =>
                    setPinData({
                      pin: e.target.value.replace(/\D/g, ""),
                    })
                  }
                  placeholder="••••"
                  className="pl-10 text-center tracking-widest text-lg font-mono"
                  required
                />
              </div>
              <p className="text-xs text-muted-foreground mt-2">
                This PIN replaces your password when using the DumosRx
                client applications on your authorized store devices.
              </p>
            </div>
          </CardContent>
          <CardFooter>
            <Button
              type="submit"
              variant="secondary"
              className="w-full mt-4"
              disabled={pinMutation.isPending || pinData.pin.length !== 4}
            >
              {pinMutation.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Save className="mr-2 h-4 w-4" />
              )}
              Update PIN
            </Button>
          </CardFooter>
        </form>
      </Card>
    </motion.div>
  );
}
