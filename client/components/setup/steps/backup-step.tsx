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
import { useRef } from "react";
import { FileUp, Loader2 } from "lucide-react";

interface BackupStepProps {
  onCancel: () => void;
  onRestore: (file: File) => Promise<void>;
  onGoToCloud?: () => void;
  isLoading: boolean;
}

export function BackupStep({
  onCancel,
  onRestore,
  onGoToCloud,
  isLoading,
}: BackupStepProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      onRestore(file);
    }
  };

  return (
    <motion.div
      key="backup"
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      className="flex-1 flex flex-col w-full"
    >
      <Card className="flex-1 sm:flex-initial flex flex-col border-none sm:border-solid sm:border-border shadow-[0_-20px_40px_rgba(0,0,0,0.15)] sm:shadow-2xl bg-background sm:bg-card/60 sm:backdrop-blur-2xl rounded-t-[2.5rem] sm:rounded-xl overflow-hidden relative">
        <CardHeader className="space-y-1 flex flex-col items-center text-center pb-2">
          <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center mb-4">
            <FileUp className="h-6 w-6 text-primary" />
          </div>
          <CardTitle className="text-2xl font-bold">Local Backup</CardTitle>
          <CardDescription className="text-muted-foreground">
            Restore from a previous backup file
          </CardDescription>
        </CardHeader>
        <CardContent className="py-8 px-6 pt-6">
          <div
            className={`flex flex-col items-center justify-center border-2 border-dashed border-border rounded-xl p-8 transition-colors ${isLoading ? "bg-background/10 cursor-not-allowed opacity-70" : "bg-background/30 hover:bg-background/50 cursor-pointer group"}`}
            onClick={() => {
              if (!isLoading) fileInputRef.current?.click();
            }}
          >
            <input
              type="file"
              ref={fileInputRef}
              className="hidden"
              accept=".drx"
              onChange={handleFileChange}
            />
            {!!(isLoading) && (
                                    <>
                                      <Loader2 className="h-10 w-10 text-primary animate-spin mb-4" />
                                      <p className="text-sm font-medium text-foreground">
                                        Restoring database...
                                      </p>
                                      <p className="text-xs text-muted-foreground mt-1">
                                        Please do not close the app
                                      </p>
                                    </>
                                  )}
                      {!(isLoading) && (
                                    <>
                                      <FileUp className="h-10 w-10 text-muted-foreground group-hover:text-primary transition-colors mb-4" />
                                      <p className="text-sm font-medium text-foreground">
                                        Click to select backup file
                                      </p>
                                      <p className="text-xs text-muted-foreground mt-1">
                                        .drx backup files supported
                                      </p>
                                    </>
                                  )}
          </div>
        </CardContent>
        <CardFooter className="pb-8 px-6 flex flex-col space-y-4">
          <Button
            variant="outline"
            className="w-full h-11"
            onClick={onCancel}
            disabled={isLoading}
          >
            Cancel
          </Button>
          {onGoToCloud && (
            <div className="text-center pt-2">
              <p className="text-sm text-muted-foreground">
                Don't have a local backup?{" "}
                <button
                  type="button"
                  onClick={onGoToCloud}
                  className="text-primary hover:underline font-semibold"
                >
                  Restore from Cloud
                </button>
              </p>
            </div>
          )}
        </CardFooter>
      </Card>
    </motion.div>
  );
}
