import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { getPaymentAccounts } from "@/lib/db/queries/setup";
import { insert, update, remove } from "@/lib/db/local-database";
import { queryKeys } from "@/lib/query-keys";

interface PaymentAccountFormData {
  name: string;
  account_type: string;
  account_number: string;
  bank_name: string;
}

interface SavePaymentAccountParams {
  formData: PaymentAccountFormData;
  editingId: string | null;
  activeUserId?: string;
  activeStoreId?: string;
}

export function usePaymentAccounts(activeStoreId?: string) {
  const { data, isLoading } = useQuery({
    ...queryKeys.paymentAccounts.all(activeStoreId),
    queryFn: () => getPaymentAccounts(activeStoreId),
  });
  return { accounts: data || [], loading: isLoading };
}

export function useSavePaymentAccountMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ formData, editingId, activeUserId, activeStoreId }: SavePaymentAccountParams) => {
      if (editingId) {
        await update("payment_accounts", editingId, {
          name: formData.name,
          account_type: formData.account_type,
          account_number: formData.account_number,
          bank_name: formData.bank_name,
          updated_at: new Date().toISOString(),
        });
        return editingId;
      }
      const newId = `pa_${Date.now()}`;
      await insert("payment_accounts", {
        id: newId,
        user_id: activeUserId,
        store_id: activeStoreId,
        name: formData.name,
        account_type: formData.account_type,
        account_number: formData.account_number,
        bank_name: formData.bank_name,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });
      return newId;
    },
    onSuccess: (_accountId, { editingId, activeStoreId }) => {
      toast.success(editingId ? "Account updated successfully" : "Account added successfully");
      queryClient.invalidateQueries(queryKeys.paymentAccounts.all(activeStoreId));
    },
    onError: (error) => {
      console.error(error);
      toast.error("Failed to save account");
    },
  });
}

export function useDeletePaymentAccountMutation(activeStoreId?: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => remove("payment_accounts", id),
    onSuccess: () => {
      toast.success("Account deleted");
      queryClient.invalidateQueries(queryKeys.paymentAccounts.all(activeStoreId));
    },
    onError: (error) => {
      console.error(error);
      toast.error("Failed to delete account");
    },
  });
}
