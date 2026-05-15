"use client";

import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { FileUp } from "lucide-react";

interface BackupStepProps {
  onCancel: () => void;
}

export function BackupStep({ onCancel }: BackupStepProps) {
  return (
    <motion.div
      key="backup"
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
    >
      <Card className="border-border shadow-2xl bg-card/60 backdrop-blur-2xl">
        <CardHeader className="space-y-1 flex flex-col items-center text-center pb-2">
          <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center mb-4">
            <FileUp className="h-6 w-6 text-primary" />
          </div>
          <CardTitle className="text-2xl font-bold">Local Backup</CardTitle>
          <CardDescription className="text-muted-foreground">
            Restore from a previous backup file
          </CardDescription>
        </CardHeader>
        <CardContent className="py-8 pt-6">
          <div className="flex flex-col items-center justify-center border-2 border-dashed border-border rounded-xl p-8 bg-background/30 hover:bg-background/50 transition-colors cursor-pointer group">
            <FileUp className="h-10 w-10 text-muted-foreground group-hover:text-primary transition-colors mb-4" />
            <p className="text-sm font-medium text-foreground">
              Click to select backup file
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              .drx backup files supported
            </p>
          </div>
        </CardContent>
        <CardFooter className="pb-8">
          <Button variant="outline" className="w-full" onClick={onCancel}>
            Cancel
          </Button>
        </CardFooter>
      </Card>
    </motion.div>
  );
}
