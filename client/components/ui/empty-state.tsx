import type { LucideIcon } from "lucide-react";
import { Inbox } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface EmptyStateAction {
  label: string;
  href?: string;
  onClick?: () => void;
  icon?: LucideIcon;
}

interface EmptyStateProps {
  icon?: LucideIcon;
  title: string;
  description?: string;
  action?: EmptyStateAction;
  className?: string;
}

/** Generic "nothing here" state for list/table/card views: icon, message, and
 * an optional actionable link or button. Callers decide the action (if any) -
 * this component has no role/permission logic of its own. */
export function EmptyState({
  icon: Icon = Inbox,
  title,
  description,
  action,
  className,
}: EmptyStateProps) {
  const ActionIcon = action?.icon;

  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center py-10 text-center text-muted-foreground",
        className,
      )}
    >
      <Icon className="h-11 w-11 opacity-40 mb-3" />
      <p className="font-semibold text-[13.5px] text-foreground">{title}</p>
      {description && (
        <p className="text-[12px] mt-1 max-w-xs">{description}</p>
      )}
      {action &&
        (action.href ? (
          <Button asChild size="sm" className="mt-4">
            <Link href={action.href}>
              {ActionIcon && <ActionIcon className="h-4 w-4" />}
              {action.label}
            </Link>
          </Button>
        ) : (
          <Button
            size="sm"
            className="mt-4"
            onClick={action.onClick}
          >
            {ActionIcon && <ActionIcon className="h-4 w-4" />}
            {action.label}
          </Button>
        ))}
    </div>
  );
}
