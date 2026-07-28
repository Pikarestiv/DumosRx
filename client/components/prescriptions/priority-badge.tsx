import { Prescription } from "@/lib/hooks/use-prescription-queue";

const COLORS: Record<Prescription["priority"], string> = {
  normal: "text-muted-foreground",
  urgent: "text-orange-600 font-bold",
  stat: "text-red-600 font-bold",
};

const LABELS: Record<Prescription["priority"], string> = {
  normal: "Normal",
  urgent: "Urgent",
  stat: "STAT",
};

export function PriorityBadge({
  priority,
}: {
  priority: Prescription["priority"];
}) {
  return <span className={`text-xs ${COLORS[priority]}`}>{LABELS[priority]}</span>;
}
