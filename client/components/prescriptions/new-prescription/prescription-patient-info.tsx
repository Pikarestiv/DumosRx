import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { User } from "lucide-react";
import type { NewPrescriptionForm } from "./use-new-prescription";

interface PrescriptionPatientInfoProps {
  formData: NewPrescriptionForm;
  setFormData: React.Dispatch<React.SetStateAction<NewPrescriptionForm>>;
}

export function PrescriptionPatientInfo({
  formData,
  setFormData,
}: PrescriptionPatientInfoProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="font-serif font-semibold flex items-center gap-2">
          <User className="h-5 w-5" />
          Patient Information
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="space-y-2">
            <Label htmlFor="patientName">Patient Name *</Label>
            <Input
              id="patientName"
              value={formData.patientName}
              onChange={(e) =>
                setFormData((prev) => ({
                  ...prev,
                  patientName: e.target.value,
                }))
              }
              placeholder="Enter patient name"
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="patientPhone">Phone Number *</Label>
            <Input
              id="patientPhone"
              value={formData.patientPhone}
              onChange={(e) =>
                setFormData((prev) => ({
                  ...prev,
                  patientPhone: e.target.value,
                }))
              }
              placeholder="08012345678"
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="patientAge">Age</Label>
            <Input
              id="patientAge"
              type="number"
              value={formData.patientAge}
              onChange={(e) =>
                setFormData((prev) => ({
                  ...prev,
                  patientAge: e.target.value,
                }))
              }
              placeholder="Age"
              min="0"
              max="120"
            />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
