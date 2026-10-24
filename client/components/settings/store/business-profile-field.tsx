import { HelpCircle } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface BusinessProfileFieldProps {
  id: string;
  label: string;
  placeholder: string;
  value: string;
  onChange: (val: string) => void;
  isEditing: boolean;
  tooltip?: string;
}

export function BusinessProfileField({
  id,
  label,
  placeholder,
  value,
  onChange,
  isEditing,
  tooltip,
}: BusinessProfileFieldProps) {
  const labelNode = <Label htmlFor={id}>{label}</Label>;
  return (
    <div className="grid gap-2">
      {tooltip ? (
        <div className="flex items-center gap-2">
          {labelNode}
          <TooltipProvider delayDuration={0}>
            <Tooltip>
              <TooltipTrigger asChild>
                <HelpCircle className="h-4 w-4 text-muted-foreground hover:text-foreground cursor-help" />
              </TooltipTrigger>
              <TooltipContent>
                <p>{tooltip}</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
      ) : (
        labelNode
      )}
      {isEditing ? (
        <Input
          id={id}
          placeholder={placeholder}
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
      ) : (
        <p className="text-sm font-medium py-2">{value || "Not set"}</p>
      )}
    </div>
  );
}
