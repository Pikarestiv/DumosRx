"use client";

import { motion } from "framer-motion";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { UserPlus, CloudDownload, FileUp } from "lucide-react";
import { APP_NAME } from "@/lib/constants";
import type { OnboardingStep } from "@/app/setup/use-onboarding";

interface WelcomeStepProps {
  onSetStep: (step: OnboardingStep) => void;
}

export function WelcomeStep({ onSetStep }: WelcomeStepProps) {
  return (
    <motion.div
      key="welcome"
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95 }}
      className="flex-1 flex flex-col w-full"
    >
      <Card className="flex-1 sm:flex-initial flex flex-col border-none sm:border-solid sm:border-border shadow-[0_-20px_40px_rgba(0,0,0,0.15)] sm:shadow-2xl bg-background sm:bg-card/60 sm:backdrop-blur-2xl rounded-t-[2.5rem] sm:rounded-xl overflow-hidden relative">
        <CardHeader className="text-center pb-2 mb-">
          <div className="flex justify-center mb-6">
            <Image
              src="/logo.png"
              alt="DumosRx Logo"
              width={180}
              height={70}
              className="object-contain"
              style={{ filter: "var(--logo-filter)", height: "auto" }}
            />
          </div>
          <CardTitle className="text-2xl font-bold">
            Welcome to {APP_NAME}
          </CardTitle>
          <CardDescription>How would you like to get started?</CardDescription>
        </CardHeader>

        <CardContent className="flex flex-col space-y-3 pt-2 md:pt-6 pb-2 md:pb-8">
          <Button
            variant="outline"
            className="h-auto p-4 flex flex-col items-start text-left gap-1 hover:border-primary/50 hover:bg-primary/5 group"
            onClick={() => onSetStep("register")}
          >
            <div className="flex items-center gap-2 font-bold text-foreground">
              <UserPlus className="h-4 w-4 text-primary" />
              Create New Store
            </div>
            <p className="text-xs text-muted-foreground text-wrap">
              Setup a fresh local database for a new business.
            </p>
          </Button>

          <Button
            variant="outline"
            className="h-auto p-4 flex flex-col items-start text-left gap-1 hover:border-primary/50 hover:bg-primary/5 group"
            onClick={() => onSetStep("cloud")}
          >
            <div className="flex items-center gap-2 font-bold text-foreground">
              <CloudDownload className="h-4 w-4 text-primary" />
              Sync from Cloud
            </div>
            <p className="text-xs text-muted-foreground text-wrap">
              Existing account? Pull your data from the DumosRx cloud.
            </p>
          </Button>

          <Button
            variant="outline"
            className="h-auto p-4 flex flex-col items-start text-left gap-1 hover:border-primary/50 hover:bg-primary/5 group"
            onClick={() => onSetStep("backup")}
          >
            <div className="flex items-center gap-2 font-bold text-foreground">
              <FileUp className="h-4 w-4 text-primary" />
              Restore from Backup
            </div>
            <p className="text-xs text-muted-foreground text-wrap">
              Upload a .drx manual backup file to restore your database.
            </p>
          </Button>
        </CardContent>
        <CardFooter>
          <p className="text-[10px] text-muted-foreground text-center w-full uppercase tracking-widest font-medium opacity-50">
            Secure Offline-First Intelligence
          </p>
        </CardFooter>
      </Card>
    </motion.div>
  );
}
