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

interface WelcomeStepProps {
  onSetStep: (step: any) => void;
}

export function WelcomeStep({ onSetStep }: WelcomeStepProps) {
  return (
    <motion.div
      key="welcome"
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95 }}
    >
      <Card className="border-border shadow-2xl bg-card/60 backdrop-blur-2xl">
        <CardHeader className="text-center pb-2">
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
        <CardContent className="grid gap-3 pt-6 pb-8">
          <Button
            variant="outline"
            className="h-auto p-4 flex flex-col items-start text-left gap-1 hover:border-primary/50 hover:bg-primary/5 group"
            onClick={() => onSetStep("register")}
          >
            <div className="flex items-center gap-2 font-bold text-foreground">
              <UserPlus className="h-4 w-4 text-primary" />
              Create New Store
            </div>
            <p className="text-xs text-muted-foreground">
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
            <p className="text-xs text-muted-foreground">
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
            <p className="text-xs text-muted-foreground">
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
