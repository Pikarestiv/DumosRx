import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { NewPrescriptionForm } from "./use-new-prescription";

interface PrescriptionNotesProps {
  formData: NewPrescriptionForm;
  setFormData: React.Dispatch<React.SetStateAction<NewPrescriptionForm>>;
}

export function PrescriptionNotes({
  formData,
  setFormData,
}: PrescriptionNotesProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="font-serif font-semibold">
          Clinical Notes
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          <Label htmlFor="notes">Additional Notes (Optional)</Label>
          <Textarea
            id="notes"
            value={formData.notes}
            onChange={(e) =>
              setFormData((prev) => ({
                ...prev,
                notes: e.target.value,
              }))
            }
            placeholder="Any special instructions, allergies, or clinical notes..."
            rows={3}
          />
        </div>
      </CardContent>
    </Card>
  );
}
