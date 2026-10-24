import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { HelpTooltip } from "./help-tooltip";

// A simple label/description + switch row, shown as read-only Enabled/Disabled text outside edit mode.
// Rationale: docs/CLIENT_COMMENTS.md#block-components-settings-store-receipt-customization-card-tsx-L33
export function ReceiptToggleRow({
  label,
  description,
  isEditing,
  checked,
  onCheckedChange,
}: {
  label: string;
  description: string;
  isEditing: boolean;
  checked: boolean;
  onCheckedChange: (val: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between rounded-lg border p-4">
      <div className="space-y-0.5">
        <Label className="text-base">{label}</Label>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
      {isEditing ? (
        <Switch checked={checked} onCheckedChange={onCheckedChange} />
      ) : (
        <p className="text-sm font-medium">
          {checked ? "Enabled" : "Disabled"}
        </p>
      )}
    </div>
  );
}

export function ReceiptTextField({
  id,
  label,
  tooltip,
  placeholder,
  isEditing,
  value,
  onChange,
  emptyText,
}: {
  id: string;
  label: string;
  tooltip: string;
  placeholder: string;
  isEditing: boolean;
  value: string;
  onChange: (val: string) => void;
  emptyText: string;
}) {
  return (
    <div className="grid gap-2">
      <div className="flex items-center gap-2">
        <Label htmlFor={id}>{label}</Label>
        <HelpTooltip>{tooltip}</HelpTooltip>
      </div>
      {isEditing ? (
        <Input
          id={id}
          placeholder={placeholder}
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
      ) : (
        <p className="text-sm font-medium py-2">{value || emptyText}</p>
      )}
    </div>
  );
}
