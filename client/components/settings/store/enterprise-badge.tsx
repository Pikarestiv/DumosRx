import { Lock } from "lucide-react";
import { Badge } from "@/components/ui/badge";

export function PlanBadge({ plan }: { plan: "Pro" | "Enterprise" }) {
  return (
    <Badge variant="outline" className="border-amber-300 text-amber-700 dark:border-amber-700 dark:text-amber-300">
      <Lock aria-hidden="true" />
      {plan}
    </Badge>
  );
}

export function EnterpriseBadge() {
  return <PlanBadge plan="Enterprise" />;
}
