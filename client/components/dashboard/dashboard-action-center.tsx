"use client";

import { useMemo, useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/context/auth-context";
import { useStore } from "@/lib/context/store-context";
import { useLocalData } from "@/lib/db/hooks/useLocalData";
import {
  CloudOff,
  UserPlus,
  Settings,
  BellRing,
  PackageX,
  Clock,
  ArrowRight,
  ChevronLeft,
  ChevronRight
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { AnimatePresence, motion } from "framer-motion";

export interface ActionCenterProps {
  expiringCount: number;
  lowStockCount: number;
}

type AlertPriority = "critical" | "warning" | "info" | "success";

interface AlertItem {
  id: string;
  title: string;
  description: string;
  icon: React.ElementType;
  priority: AlertPriority;
  actionLabel: string;
  actionRoute: string;
}

export function DashboardActionCenter({ expiringCount, lowStockCount }: ActionCenterProps) {
  const router = useRouter();
  const { isAuthenticated } = useAuth();
  const { storeProfile } = useStore();
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  
  const { data: staffData } = useLocalData<{ count: number }>(
    "SELECT COUNT(*) as count FROM staff WHERE _deleted = 0"
  );

  const staffCount = staffData[0]?.count || 0;

  const alerts = useMemo(() => {
    const items: AlertItem[] = [];

    if (!isAuthenticated) {
      items.push({
        id: "cloud-sync",
        title: "No Cloud Account Linked",
        description: "Link to DumosRx Cloud to enable backups and remote sync.",
        icon: CloudOff,
        priority: "critical",
        actionLabel: "Link Account",
        actionRoute: "/settings?tab=cloud"
      });
    }

    if (staffCount === 0) {
      items.push({
        id: "no-staff",
        title: "No Staff Accounts Found",
        description: "Create staff PINs so your cashiers can log in to the POS.",
        icon: UserPlus,
        priority: "critical",
        actionLabel: "Create Staff",
        actionRoute: "/settings?tab=staff"
      });
    }

    if (storeProfile) {
      const fieldsToCheck = ['address', 'phone', 'email', 'pcn_license', 'logo_url'];
      const filledFields = fieldsToCheck.filter(field => !!(storeProfile as any)[field]);
      const percentage = Math.round((filledFields.length / fieldsToCheck.length) * 100);

      if (percentage < 100) {
        items.push({
          id: "profile-incomplete",
          title: `Store Profile is ${percentage}% Complete`,
          description: "Complete your profile to ensure your receipts look professional.",
          icon: Settings,
          priority: "info",
          actionLabel: "Complete Now",
          actionRoute: "/settings?tab=general"
        });
      }
    } else {
        items.push({
            id: "profile-missing",
            title: `Store Setup Required`,
            description: "Please configure your business details and terminology.",
            icon: Settings,
            priority: "critical",
            actionLabel: "Setup Now",
            actionRoute: "/settings?tab=general"
          });
    }

    if (expiringCount > 0) {
      items.push({
        id: "expiring-soon",
        title: `${expiringCount} Items Expiring Soon`,
        description: "Review your inventory to discount or remove items.",
        icon: Clock,
        priority: "warning",
        actionLabel: "Check Now",
        actionRoute: "/inventory?filter=expiring"
      });
    }

    if (lowStockCount > 0) {
      items.push({
        id: "low-stock",
        title: `${lowStockCount} Items Low on Stock`,
        description: "You have products below their designated reorder level.",
        icon: PackageX,
        priority: "warning",
        actionLabel: "View Needs",
        actionRoute: "/inventory?filter=low-stock"
      });
    }

    const priorityWeights = { critical: 3, warning: 2, info: 1, success: 0 };
    return items.sort((a, b) => priorityWeights[b.priority] - priorityWeights[a.priority]);

  }, [isAuthenticated, staffCount, storeProfile, expiringCount, lowStockCount]);

  // Auto-rotate logic
  useEffect(() => {
    if (alerts.length <= 1 || isPaused) return;
    const interval = setInterval(() => {
      setCurrentIndex((prev) => (prev + 1) % alerts.length);
    }, 5000);
    return () => clearInterval(interval);
  }, [alerts.length, isPaused]);

  if (alerts.length === 0) return null;

  const currentAlert = alerts[currentIndex];

  const getPriorityColors = (priority: AlertPriority) => {
    switch (priority) {
      case "critical":
        return "bg-destructive/10 border-destructive/20 text-destructive";
      case "warning":
        return "bg-amber-500/10 border-amber-500/20 text-amber-500 dark:bg-amber-500/20";
      case "info":
        return "bg-primary/10 border-primary/20 text-primary";
      case "success":
        return "bg-emerald-500/10 border-emerald-500/20 text-emerald-500 dark:bg-emerald-500/20";
    }
  };

  const handleNext = () => setCurrentIndex((prev) => (prev + 1) % alerts.length);
  const handlePrev = () => setCurrentIndex((prev) => (prev - 1 + alerts.length) % alerts.length);

  return (
    <Card 
      className="border-border bg-card shadow-sm mb-6 overflow-hidden relative"
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
    >
      <div className="bg-muted/30 px-6 py-2.5 border-b border-border flex items-center justify-between">
        <div className="flex items-center gap-2">
          <BellRing className="h-4 w-4 text-primary" />
          <h3 className="font-bold text-sm text-foreground">Action Center</h3>
          <span className="bg-primary text-primary-foreground text-[10px] font-black px-2 py-0.5 rounded-full ml-2">
            {currentIndex + 1} of {alerts.length}
          </span>
        </div>
        {alerts.length > 1 && (
          <div className="flex items-center gap-1">
            <button onClick={handlePrev} className="p-1 hover:bg-accent rounded-md transition-colors text-muted-foreground hover:text-foreground">
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button onClick={handleNext} className="p-1 hover:bg-accent rounded-md transition-colors text-muted-foreground hover:text-foreground">
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        )}
      </div>
      <CardContent className="p-0 bg-card">
        <AnimatePresence mode="wait">
          <motion.div
            key={currentAlert.id}
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            transition={{ duration: 0.2 }}
            className="p-4 flex flex-col sm:flex-row sm:items-center gap-4 transition-colors"
          >
            <div className={`p-3 rounded-2xl shrink-0 ${getPriorityColors(currentAlert.priority)}`}>
              <currentAlert.icon className="h-5 w-5" />
            </div>
            <div className="flex-1 min-w-0">
              <h4 className="font-bold text-sm text-foreground">{currentAlert.title}</h4>
              <p className="text-xs font-medium text-muted-foreground mt-0.5 pr-4 truncate sm:whitespace-normal">
                {currentAlert.description}
              </p>
            </div>
            <Button 
              size="sm" 
              variant="outline"
              onClick={() => router.push(currentAlert.actionRoute)}
              className="shrink-0 w-full sm:w-auto h-9 font-bold bg-background border-border hover:bg-accent hover:text-accent-foreground"
            >
              {currentAlert.actionLabel}
              <ArrowRight className="h-3.5 w-3.5 ml-2" />
            </Button>
          </motion.div>
        </AnimatePresence>
      </CardContent>
    </Card>
  );
}
