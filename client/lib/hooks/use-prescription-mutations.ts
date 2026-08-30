import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { updatePrescriptionStatus as updateDbPrescriptionStatus } from "@/lib/db/queries/prescriptions";
import type { PrescriptionStatus } from "@/lib/types/prescription";

interface UpdateStatusParams {
  id: string;
  status: PrescriptionStatus;
}

export function useUpdatePrescriptionStatusMutation() {
  return useMutation({
    mutationFn: ({ id, status }: UpdateStatusParams) => updateDbPrescriptionStatus(id, status),
    onError: (error) => {
      console.error("Failed to update prescription status", error);
      toast.error("Failed to update prescription status");
    },
  });
}
