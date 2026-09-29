import { Textarea } from "@/components/ui/textarea";
import { ADJUSTMENT_REASONS, type AdjustmentReasonValue } from "./adjustment-derivations";

interface AdjustmentPreferencesStepProps {
  reason: AdjustmentReasonValue;
  note: string;
  onReasonChange: (reason: AdjustmentReasonValue) => void;
  onNoteChange: (note: string) => void;
}

export function AdjustmentPreferencesStep({
  reason,
  note,
  onReasonChange,
  onNoteChange,
}: AdjustmentPreferencesStepProps) {
  return (
    <div className="animate-in fade-in slide-in-from-left-4 duration-300 space-y-5">
      <div>
        <div className="text-[17px] font-semibold mb-1.5">Adjustment preferences</div>
        <div className="text-[13px] text-muted-foreground">
          Why is this stock being adjusted?
        </div>
      </div>

      <fieldset className="space-y-2">
        <legend className="text-[11px] text-muted-foreground font-semibold uppercase mb-2">
          Reason for adjustment
        </legend>
        {ADJUSTMENT_REASONS.map((option) => (
          <label
            key={option.value}
            className={`flex items-center gap-3 p-3 rounded-xl border cursor-pointer ${
              reason === option.value ? "border-primary bg-primary/5" : "border-border bg-card"
            }`}
          >
            <input
              type="radio"
              name="adjustment-reason"
              value={option.value}
              checked={reason === option.value}
              onChange={() => onReasonChange(option.value)}
              className="accent-primary"
            />
            <span className="text-[14px] font-medium">{option.label}</span>
            <span className="ml-auto text-[11.5px] text-muted-foreground/70">
              {option.direction === "increase"
                ? "Adds stock"
                : option.direction === "decrease"
                  ? "Removes stock"
                  : "Adds or removes"}
            </span>
          </label>
        ))}
      </fieldset>

      <div className="space-y-1.5">
        <label
          htmlFor="adjustment-note"
          className="text-[11px] text-muted-foreground font-semibold uppercase"
        >
          Note (optional)
        </label>
        <Textarea
          id="adjustment-note"
          value={note}
          maxLength={200}
          onChange={(event) => onNoteChange(event.target.value)}
          placeholder="Anything worth recording about this adjustment"
        />
      </div>
    </div>
  );
}
