import { useMutation } from "@tanstack/react-query";
import { insert, update, softDelete } from "@/lib/db/local-database";

interface ExpenseFormData {
  category: string;
  amount: string;
  description: string;
  date: string;
  payment_method: string;
  notes: string;
  covers_months: string;
}

interface SaveExpenseParams {
  formData: ExpenseFormData;
  expenseId?: string;
  userId?: string;
}

export function useSaveExpenseMutation() {
  return useMutation({
    mutationFn: async ({ formData, expenseId, userId }: SaveExpenseParams) => {
      const data = {
        ...formData,
        amount: parseFloat(formData.amount),
        covers_months: formData.covers_months ? parseInt(formData.covers_months, 10) : null,
        user_id: userId,
      };

      if (expenseId) {
        await update("expenses", expenseId, data);
      } else {
        await insert("expenses", data);
      }
    },
  });
}

export function useDeleteExpenseMutation() {
  return useMutation({
    mutationFn: (id: string) => softDelete("expenses", id),
  });
}

interface QuickEditExpenseParams {
  id: string;
  amount: number;
  category: string;
}

/** The expense list's inline "quick edit" row only ever patches amount and
 * category — a narrower mutation than the full add/edit dialog's payload. */
export function useQuickEditExpenseMutation() {
  return useMutation({
    mutationFn: ({ id, amount, category }: QuickEditExpenseParams) =>
      update("expenses", id, { amount, category }),
  });
}
