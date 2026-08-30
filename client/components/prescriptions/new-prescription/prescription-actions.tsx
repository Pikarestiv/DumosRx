import { Button } from "@/components/ui/button";
import { Save, Loader2 } from "lucide-react";

interface PrescriptionActionsProps {
  isEditing: boolean;
  resetForm: () => void;
  cancelEdit: () => void;
  isSaving?: boolean;
}

export function PrescriptionActions({
  isEditing,
  resetForm,
  cancelEdit,
  isSaving = false,
}: PrescriptionActionsProps) {
  return (
    <div className="flex gap-4">
      <Button
        type="submit"
        disabled={isSaving}
        className="bg-accent hover:bg-accent/90 flex items-center gap-2"
      >
        {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
        {isEditing ? "Update Prescription" : "Create Prescription"}
      </Button>
      <Button type="button" variant="outline" onClick={resetForm} disabled={isSaving}>
        {isEditing ? "Reset Form" : "Clear Form"}
      </Button>
      {isEditing && (
        <Button type="button" variant="outline" onClick={cancelEdit} disabled={isSaving}>
          Cancel Edit
        </Button>
      )}
    </div>
  );
}
