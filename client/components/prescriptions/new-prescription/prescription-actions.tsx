import { Button } from "@/components/ui/button";
import { Save } from "lucide-react";

interface PrescriptionActionsProps {
  isEditing: boolean;
  resetForm: () => void;
  cancelEdit: () => void;
}

export function PrescriptionActions({
  isEditing,
  resetForm,
  cancelEdit,
}: PrescriptionActionsProps) {
  return (
    <div className="flex gap-4">
      <Button
        type="submit"
        className="bg-accent hover:bg-accent/90 flex items-center gap-2"
      >
        <Save className="h-4 w-4" />
        {isEditing ? "Update Prescription" : "Create Prescription"}
      </Button>
      <Button type="button" variant="outline" onClick={resetForm}>
        {isEditing ? "Reset Form" : "Clear Form"}
      </Button>
      {isEditing && (
        <Button type="button" variant="outline" onClick={cancelEdit}>
          Cancel Edit
        </Button>
      )}
    </div>
  );
}
