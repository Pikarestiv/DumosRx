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
  // The store this device is actually running as, if any — used to keep the local `stores` row in sync with a cloud edit to the same store (see…
  // Rationale: docs/CLIENT_LIB_COMMENTS.md#hooks-use-fleet-mutations-ts-L17
  activeStoreId: string | null;
}

export function useSaveFleetStoreMutation() {
  return useMutation({
    mutationFn: async ({ isEditing, storeId, formData, activeStoreId }: SaveFleetStoreParams) => {
      if (isEditing && storeId) {
        await apiClient.updateStore(storeId, formData);

        // The Business Information card writes name/address/phone to the local `stores` row and queues a sync push independently of Fleet.
        // Rationale: docs/CLIENT_LIB_COMMENTS.md#line-hooks-use-fleet-mutations-ts-L28
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
