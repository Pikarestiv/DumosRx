import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Pill, Plus, Trash2 } from "lucide-react";
import type { NewPrescriptionForm, PrescriptionMedication } from "./use-new-prescription";

interface PrescriptionMedicationsProps {
  formData: NewPrescriptionForm;
  newMedication: {
    medicineName: string;
    strength: string;
    dosage: string;
    quantity: number;
    instructions: string;
  };
  setNewMedication: React.Dispatch<React.SetStateAction<any>>;
  availableMedicines: any[];
  addMedication: () => void;
  removeMedication: (id: string) => void;
  editMedication: (id: string) => void;
  formatCurrency: (amount: number) => string;
  totalCost: number;
}

export function PrescriptionMedications({
  formData,
  newMedication,
  setNewMedication,
  availableMedicines,
  addMedication,
  removeMedication,
  editMedication,
  formatCurrency,
  totalCost,
}: PrescriptionMedicationsProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="font-serif font-semibold flex items-center gap-2">
          <Pill className="h-5 w-5" />
          Medications
        </CardTitle>
      </CardHeader>
      <CardContent>
        {/* Add New Medication */}
        <div className="p-4 border border-border rounded-lg mb-4">
          <h4 className="font-medium mb-3">Add Medication</h4>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label>Medicine Name *</Label>
              <Select
                value={newMedication.medicineName}
                onValueChange={(value) => {
                  setNewMedication((prev: any) => ({
                    ...prev,
                    medicineName: value,
                    strength: "",
                  }));
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select medicine" />
                </SelectTrigger>
                <SelectContent>
                  {Array.from(
                    new Set(availableMedicines.map((m) => m.name))
                  ).map((name) => (
                    <SelectItem key={name} value={name}>
                      {name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Strength *</Label>
              <Select
                value={newMedication.strength}
                onValueChange={(value) =>
                  setNewMedication((prev: any) => ({
                    ...prev,
                    strength: value,
                  }))
                }
                disabled={!newMedication.medicineName}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select strength" />
                </SelectTrigger>
                <SelectContent>
                  {availableMedicines
                    .filter((m) => m.name === newMedication.medicineName)
                    .map((medicine) => (
                      <SelectItem
                        key={medicine.strength}
                        value={medicine.strength}
                      >
                        {medicine.strength}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Quantity *</Label>
              <Input
                type="number"
                value={newMedication.quantity}
                onChange={(e) =>
                  setNewMedication((prev: any) => ({
                    ...prev,
                    quantity: Number.parseInt(e.target.value) || 1,
                  }))
                }
                min="1"
                placeholder="1"
              />
            </div>

            <div className="space-y-2">
              <Label>Dosage *</Label>
              <Input
                value={newMedication.dosage}
                onChange={(e) =>
                  setNewMedication((prev: any) => ({
                    ...prev,
                    dosage: e.target.value,
                  }))
                }
                placeholder="e.g., 3 times daily"
              />
            </div>

            <div className="space-y-2 md:col-span-2">
              <Label>Instructions</Label>
              <Input
                value={newMedication.instructions}
                onChange={(e) =>
                  setNewMedication((prev: any) => ({
                    ...prev,
                    instructions: e.target.value,
                  }))
                }
                placeholder="e.g., Take with food after meals"
              />
            </div>
          </div>
          <Button
            type="button"
            onClick={addMedication}
            className="mt-4 bg-accent hover:bg-accent/90"
          >
            <Plus className="h-4 w-4 mr-2" />
            Add Medication
          </Button>
        </div>

        {/* Medication List */}
        {formData.medications.length > 0 && (
          <div className="space-y-3">
            <h4 className="font-medium">
              Prescribed Medications ({formData.medications.length})
            </h4>
            {formData.medications.map((medication: PrescriptionMedication) => (
              <div
                key={medication.id}
                className="p-3 border border-border rounded-lg"
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <h5 className="font-medium">
                        {medication.medicineName}
                      </h5>
                      <Badge variant="outline" className="text-xs">
                        {medication.strength}
                      </Badge>
                    </div>
                    <p className="text-sm text-muted-foreground mt-1">
                      Quantity: {medication.quantity} • Dosage:{" "}
                      {medication.dosage}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      Instructions: {medication.instructions}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="font-medium">
                      {formatCurrency(medication.cost)}
                    </span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => editMedication(medication.id)}
                    >
                      <span className="sr-only">Edit</span>
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        width="16"
                        height="16"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        className="lucide lucide-pencil"
                      >
                        <path d="M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z" />
                        <path d="m15 5 4 4" />
                      </svg>
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => removeMedication(medication.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </div>
            ))}
            <div className="flex justify-between items-center pt-3 border-t border-border">
              <span className="font-bold">Total Cost:</span>
              <span className="font-bold text-lg">
                {formatCurrency(totalCost)}
              </span>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
