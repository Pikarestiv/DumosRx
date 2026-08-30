import { useMutation } from "@tanstack/react-query";
import { insert, update, generateId } from "@/lib/db/local-database";
import { recordCustomerPayment } from "@/lib/db/queries/customers";
import type { CustomerFormPayload } from "@/lib/types/customer";

export interface NewCustomerData {
  id: string;
  first_name?: string;
  last_name?: string;
  email?: string;
  phone?: string;
  address?: string;
  date_of_birth?: string;
  gender?: string;
  allergies?: string;
  medical_conditions?: string;
  is_active: number;
  created_at: string;
  updated_at: string;
}

/** Returns the full row it created, since callers (customer management)
 * transform it into their own view model immediately rather than waiting on
 * a refetch. */
export function useCreateCustomerMutation() {
  return useMutation({
    mutationFn: async (payload: CustomerFormPayload): Promise<NewCustomerData> => {
      const now = new Date().toISOString();
      const customerData: NewCustomerData = {
        id: generateId(),
        first_name: payload.first_name,
        last_name: payload.last_name,
        email: payload.email,
        phone: payload.phone,
        address: payload.address,
        date_of_birth: payload.date_of_birth,
        gender: payload.gender,
        allergies: payload.allergies,
        medical_conditions: payload.medical_conditions,
        is_active: 1,
        created_at: now,
        updated_at: now,
      };

      // insert()'s global cache invalidation refreshes the `customers`
      // query in the background, so no need to hand-splice the new row into
      // local state — the caller gets it back directly for immediate use.
      await insert("customers", { ...customerData });
      return customerData;
    },
  });
}

interface UpdateCustomerParams {
  id: string;
  payload: CustomerFormPayload;
}

export function useUpdateCustomerMutation() {
  return useMutation({
    mutationFn: async ({ id, payload }: UpdateCustomerParams) => {
      const customerData = {
        first_name: payload.first_name ?? null,
        last_name: payload.last_name ?? null,
        email: payload.email ?? null,
        phone: payload.phone ?? null,
        address: payload.address ?? null,
        date_of_birth: payload.date_of_birth || null,
        gender: payload.gender ?? null,
        allergies: payload.allergies ?? null,
        medical_conditions: payload.medical_conditions ?? null,
      };
      await update("customers", id, customerData);
      return customerData;
    },
  });
}

interface RecordCustomerPaymentParams {
  customerId: string;
  amount: number;
  paymentMethod: string;
  notes?: string;
}

/** Shared by every "Record Payment" call site (Customer Management, POS
 * transaction details) so they go through one mutation instead of separate
 * copies of the same call + toast. */
export function useRecordCustomerPaymentMutation() {
  return useMutation({
    mutationFn: ({ customerId, amount, paymentMethod, notes }: RecordCustomerPaymentParams) =>
      recordCustomerPayment(customerId, amount, paymentMethod, notes),
  });
}
