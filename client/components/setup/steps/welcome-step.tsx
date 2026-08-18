"use client";

import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import {
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { AuthCardShell } from "@/components/auth/auth-card-shell";
import { UserPlus, CloudDownload, FileUp, type LucideIcon } from "lucide-react";
import { APP_NAME } from "@/lib/constants";
import type { OnboardingStep } from "@/app/setup/use-onboarding";

interface WelcomeStepProps {
  onSetStep: (step: OnboardingStep) => void;
  onGoToRegister: () => void;
  header?: React.ReactNode;
}

interface OnboardingOptionCardProps {
  icon: LucideIcon;
  title: string;
  description: string;
  onClick: () => void;
}

/** One tappable "how would you like to get started" option — pulled out
 * since welcome-step just repeated this button markup three times. */
function OnboardingOptionCard({
  icon: Icon,
  title,
  description,
  onClick,
}: OnboardingOptionCardProps) {
  return (
    <Button
      variant="outline"
      className="h-auto p-4 flex flex-col items-start text-left gap-1 hover:border-primary/50 hover:bg-primary/5 group"
      onClick={onClick}
    >
      <div className="flex items-center gap-2 font-bold text-foreground">
        <Icon className="h-4 w-4 text-primary" />
        {title}
      </div>
      <p className="text-xs text-muted-foreground text-wrap">{description}</p>
    </Button>
  );
}

const ONBOARDING_OPTIONS: Omit<OnboardingOptionCardProps, "onClick">[] = [
  {
    icon: UserPlus,
    title: "Set Up New Business",
    description:
      "Create your DumosRx cloud account and store. Requires internet.",
  },
  {
    icon: CloudDownload,
    title: "Sign In to Existing Account",
    description:
      "Already have a DumosRx account? Pull your data from the cloud.",
  },
  {
    icon: FileUp,
    title: "Restore from Backup",
    description: "Upload a .drx manual backup file to restore your database.",
  },
];

export function WelcomeStep({
  onSetStep,
  onGoToRegister,
  header,
}: WelcomeStepProps) {
  const handlers: Array<() => void> = [
    onGoToRegister,
    () => onSetStep("cloud"),
    () => onSetStep("backup"),
  ];

  return (
    <motion.div
      key="welcome"
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95 }}
      className="flex-1 flex flex-col w-full"
    >
      <AuthCardShell variant="page" header={header}>
        <CardHeader className="text-center p-0">
          <CardTitle className="text-xl font-bold">
            Welcome to {APP_NAME}
          </CardTitle>
          <CardDescription className="text-muted-foreground">
            How would you like to get started?
          </CardDescription>
        </CardHeader>

        <CardContent className="flex flex-col space-y-3 mb-14 sm:mb-2 px-0">
          {ONBOARDING_OPTIONS.map((option, index) => (
            <OnboardingOptionCard
              key={option.title}
              {...option}
              onClick={handlers[index]}
            />
          ))}
        </CardContent>
      </AuthCardShell>
    </motion.div>
  );
}
