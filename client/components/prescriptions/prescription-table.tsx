"use client";

import { 
  FileText, 
  Phone, 
  Eye 
} from "lucide-react";
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from "@/components/ui/table";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Prescription } from "@/lib/hooks/use-prescription-queue";

interface PrescriptionTableProps {
  prescriptions: Prescription[];
  filteredCount: number;
  totalCount: number;
  formatCurrency: (amount: number) => string;
  formatDateTime: (dateString: string) => string;
  getStatusBadge: (status: Prescription["status"]) => React.ReactNode;
  getPriorityBadge: (priority: Prescription["priority"]) => React.ReactNode;
  viewDetails: (prescription: Prescription) => void;
  updateStatus: (id: string, status: Prescription["status"]) => void;
}

export function PrescriptionTable({
  prescriptions,
  filteredCount,
  totalCount,
  formatCurrency,
  formatDateTime,
  getStatusBadge,
  getPriorityBadge,
  viewDetails,
  updateStatus
}: PrescriptionTableProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="font-serif font-semibold">
          Active Prescriptions
        </CardTitle>
        <CardDescription>
          Showing {filteredCount} of {totalCount} prescriptions
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Prescription</TableHead>
                <TableHead>Patient</TableHead>
                <TableHead>Doctor</TableHead>
                <TableHead>Date Issued</TableHead>
                <TableHead>Priority</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Medications</TableHead>
                <TableHead>Total Cost</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {prescriptions.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={9} className="h-32 text-center">
                    <div className="flex flex-col items-center justify-center text-muted-foreground">
                      <FileText className="h-8 w-8 mb-2 opacity-50" />
                      <p className="font-medium">No prescriptions found</p>
                      <p className="text-sm">Prescriptions will appear here as they're added</p>
                    </div>
                  </TableCell>
                </TableRow>
              ) : (
                prescriptions.map((prescription) => (
                  <TableRow key={prescription.id}>
                    <TableCell>
                      <div>
                        <code className="text-sm bg-muted px-2 py-1 rounded">
                          {prescription.prescriptionNumber}
                        </code>
                        {prescription.insurance && (
                          <div className="text-xs text-muted-foreground mt-1">
                            Insurance: {prescription.insurance}
                          </div>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div>
                        <div className="font-medium">
                          {prescription.patientName}
                        </div>
                        <div className="text-sm text-muted-foreground flex items-center gap-1">
                          <Phone className="h-3 w-3" />
                          {prescription.patientPhone || "-"}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          Age: {prescription.patientAge || "-"}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div>
                        <div className="font-medium">
                          {prescription.doctorName}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {prescription.doctorLicense}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      {formatDateTime(prescription.dateIssued)}
                    </TableCell>
                    <TableCell>
                      {getPriorityBadge(prescription.priority)}
                    </TableCell>
                    <TableCell>
                      {getStatusBadge(prescription.status)}
                    </TableCell>
                    <TableCell>
                      <div className="text-center">
                        <span className="font-medium">
                          {prescription.medications.length}
                        </span>
                        <div className="text-xs text-muted-foreground">
                          {prescription.medications.some(
                            (m) => !m.available,
                          ) && (
                            <span className="text-red-600">
                              Some unavailable
                            </span>
                          )}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="font-medium">
                        {formatCurrency(prescription.totalCost)}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => viewDetails(prescription)}
                          className="cursor-pointer"
                        >
                          <Eye className="h-4 w-4" />
                        </Button>
                        {prescription.status === "pending" && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => updateStatus(prescription.id, "in_progress")}
                            className="cursor-pointer"
                          >
                            Start
                          </Button>
                        )}
                        {prescription.status === "in_progress" && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => updateStatus(prescription.id, "ready")}
                            className="cursor-pointer"
                          >
                            Ready
                          </Button>
                        )}
                        {prescription.status === "ready" && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => updateStatus(prescription.id, "dispensed")}
                            className="cursor-pointer"
                          >
                            Dispense
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}
