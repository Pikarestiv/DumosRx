import type { ReactNode } from "react";
import { HelpCircle } from "lucide-react";
import { Label } from "@/components/ui/label";
import { HintTooltip } from "@/components/ui/hint-tooltip";

interface FieldLabelProps {
  htmlFor?: string;
  hint: string;
  className?: string;
  children: ReactNode;
}

export function FieldLabel({ htmlFor, hint, className, children }: FieldLabelProps) {
  return (
    <div className="flex items-center gap-1">
      <Label htmlFor={htmlFor} className={className}>
        {children}
      </Label>
      <HintTooltip text={hint}>
        <HelpCircle
          tabIndex={-1}
          role="img"
          aria-label={hint}
          className="w-3 h-3 opacity-50 cursor-help shrink-0"
        />
      </HintTooltip>
    </div>
  );
}
