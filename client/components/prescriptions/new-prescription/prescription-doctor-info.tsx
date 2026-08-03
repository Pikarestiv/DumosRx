import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { FileText } from "lucide-react";
import type { NewPrescriptionForm } from "./use-new-prescription";
import type { PrescriptionPriority } from "@/lib/types/prescription";

interface PrescriptionDoctorInfoProps {
  formData: NewPrescriptionForm;
  setFormData: React.Dispatch<React.SetStateAction<NewPrescriptionForm>>;
}

export function PrescriptionDoctorInfo({
  formData,
  setFormData,
}: PrescriptionDoctorInfoProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="font-serif font-semibold flex items-center gap-2">
          <FileText className="h-5 w-5" />
          Prescriber Information
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="space-y-2">
            <Label htmlFor="doctorName">Doctor Name *</Label>
            <Input
              id="doctorName"
              value={formData.doctorName}
              onChange={(e) =>
                setFormData((prev) => ({
                  ...prev,
                  doctorName: e.target.value,
                }))
              }
              placeholder="Dr. John Smith"
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="doctorLicense">License Number *</Label>
            <Input
              id="doctorLicense"
              value={formData.doctorLicense}
              onChange={(e) =>
                setFormData((prev) => ({
                  ...prev,
                  doctorLicense: e.target.value,
                }))
              }
              placeholder="MD-12345"
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="priority">Priority</Label>
            <Select
              value={formData.priority}
              onValueChange={(value: PrescriptionPriority) =>
                setFormData((prev) => ({ ...prev, priority: value }))
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="normal">Normal</SelectItem>
                <SelectItem value="urgent">Urgent</SelectItem>
                <SelectItem value="stat">STAT</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="mt-4">
          <Label htmlFor="insurance">Insurance (Optional)</Label>
          <Input
            id="insurance"
            value={formData.insurance}
            onChange={(e) =>
              setFormData((prev) => ({
                ...prev,
                insurance: e.target.value,
              }))
            }
            placeholder="NHIS, HMO, etc."
          />
        </div>
      </CardContent>
    </Card>
  );
}
