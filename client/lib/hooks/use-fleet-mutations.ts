import { useMutation } from "@tanstack/react-query";
import { apiClient } from "@/lib/api/client";
import { update } from "@/lib/db/base-helpers";

interface FleetStoreFormData {
  name: string;
  location: string;
  address: string;
  phone: string;
  store_type: string;
}

interface SaveFleetStoreParams {
  isEditing: boolean;
  storeId?: string;
  formData: FleetStoreFormData;
  /** The store this device is actually running as, if any — used to keep the
   * local `stores` row in sync with a cloud edit to the same store (see
   * comment in the mutation body). */
  activeStoreId: string | null;
}

export function useSaveFleetStoreMutation() {
  return useMutation({
    mutationFn: async ({ isEditing, storeId, formData, activeStoreId }: SaveFleetStoreParams) => {
      if (isEditing && storeId) {
        await apiClient.updateStore(storeId, formData);

        // The Business Information card writes name/address/phone to the
        // local `stores` row and queues a sync push independently of Fleet.
        // If Fleet edits the active store's fields but the local row still
        // holds pre-edit values, that queued push would silently revert
        // this edit on the next sync. Writing the same fields locally too
        // (only for the store this device is actually running) keeps local
        // state in step with what we just wrote to the cloud.
        if (activeStoreId && storeId === activeStoreId) {
          await update("stores", activeStoreId, {
            name: formData.name,
            location: formData.location,
            address: formData.address,
            phone: formData.phone,
            store_type: formData.store_type,
          });
        }
      } else {
        await apiClient.createStore(formData);
      }
    },
  });
}

export function useDeleteFleetStoreMutation() {
  return useMutation({
    mutationFn: (id: string) => apiClient.deleteStore(id),
  });
}
