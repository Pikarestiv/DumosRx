"use client";

import { motion } from "framer-motion";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Cloud, Loader2, Database, CheckCircle2 } from "lucide-react";
import { Progress } from "@/components/ui/progress";

interface SyncingStepProps {
  progress: number;
  status: string;
}

export function SyncingStep({ progress, status }: SyncingStepProps) {
  return (
    <motion.div
      key="syncing"
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 1.1 }}
    >
      <Card className="border-border shadow-2xl bg-card/60 backdrop-blur-2xl">
        <CardHeader className="text-center pb-2">
          <div className="flex justify-center mb-8 relative">
            <div className="absolute inset-0 flex items-center justify-center animate-pulse">
              <div className="w-24 h-24 rounded-full bg-primary/5 blur-xl" />
            </div>
            <div className="relative flex items-center gap-4 bg-background/50 p-4 rounded-2xl border border-primary/20">
              <Cloud className="h-8 w-8 text-primary animate-bounce" />
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
              <Database className="h-8 w-8 text-accent animate-pulse" />
            </div>
          </div>
          <CardTitle className="text-2xl font-bold tracking-tight">
            Synchronizing Data
          </CardTitle>
          <CardDescription>
            Bringing your DumosRx cloud environment to this device
          </CardDescription>
        </CardHeader>
        <CardContent className="pt-10 pb-8 space-y-6">
          <div className="space-y-2">
            <div className="flex justify-between text-xs font-medium">
              <span className="text-muted-foreground flex items-center gap-2">
                {progress < 100 ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <CheckCircle2 className="h-3 w-3 text-green-500" />
                )}
                {status}
              </span>
              <span className="text-primary font-bold">{progress}%</span>
            </div>
            <Progress value={progress} className="h-2" />
          </div>

          <div className="p-4 rounded-lg bg-primary/5 border border-primary/10">
            <p className="text-[11px] leading-relaxed text-muted-foreground text-center">
              <span className="font-bold text-primary mr-1">Note:</span>
              This process ensures all your medications, staff profiles, and
              financial records are securely transferred. Please do not close
              the application.
            </p>
          </div>
        </CardContent>
        <CardFooter className="pb-8 justify-center">
          <p className="text-[10px] uppercase tracking-[0.2em] font-bold text-muted-foreground/40 flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-primary/40" />
            Secure End-to-End Encryption
          </p>
        </CardFooter>
      </Card>
    </motion.div>
  );
}
