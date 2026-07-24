"use client";

import { useState } from "react";
import { motion } from "framer-motion";
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
import { CloudDownload, Loader2 } from "lucide-react";
import { WEB_APP_URL } from "@/lib/constants";

interface CloudStepProps {
  onCloudRestore: (email: string, pass: string) => Promise<void>;
  isLoading: boolean;
}

export function CloudStep({ onCloudRestore, isLoading }: CloudStepProps) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onCloudRestore(email.trim().toLowerCase(), password);
  };

  return (
    <motion.div
      key="cloud"
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      className="flex-1 flex flex-col w-full"
    >
      <Card className="flex-1 px-4 sm:px-6 p-6 sm:flex-initial flex flex-col border-none sm:border-solid sm:border-border shadow-[0_-20px_40px_rgba(0,0,0,0.15)] sm:shadow-2xl bg-background sm:bg-card/60 sm:backdrop-blur-2xl rounded-t-[2.5rem] sm:rounded-xl overflow-hidden relative">
        <CardHeader className="space-y-1 flex flex-col items-center text-center pb-2">
          <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center mb-4">
            <CloudDownload className="h-6 w-6 text-primary" />
          </div>
          <CardTitle className="text-2xl font-bold">Cloud Restore</CardTitle>
          <CardDescription className="text-muted-foreground">
            Login with your DumosRx Cloud ID
          </CardDescription>
        </CardHeader>
        <form onSubmit={handleSubmit}>
          <CardContent className="space-y-4 pt-6">
            <div className="space-y-2">
              <Label htmlFor="cloud-email">Email Address</Label>
              <Input
                id="cloud-email"
                type="email"
                placeholder="your@email.com"
                className="bg-background/50 lowercase"
                value={email}
                onChange={(e) => setEmail(e.target.value.toLowerCase())}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="cloud-pass">Password</Label>
              <Input
                id="cloud-pass"
                type="password"
                placeholder="••••••••"
                className="bg-background/50"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>
          </CardContent>
          <CardFooter className="flex flex-col space-y-4 pt-6 pb-8">
            <Button
              type="submit"
              className="w-full h-12 text-lg font-bold shadow-lg"
              disabled={isLoading}
            >
              {!!isLoading && <Loader2 className="mr-2 h-5 w-5 animate-spin" />}
              {!isLoading && "Start Cloud Sync"}
            </Button>
            <div className="text-center pt-2">
              <p className="text-sm text-muted-foreground">
                Don't have a cloud account?{" "}
                <a
                  href={`${WEB_APP_URL}/register`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary hover:underline font-semibold animate-pulse hover:animate-none"
                >
                  Create one here
                </a>
              </p>
            </div>
          </CardFooter>
        </form>
      </Card>
    </motion.div>
  );
}
