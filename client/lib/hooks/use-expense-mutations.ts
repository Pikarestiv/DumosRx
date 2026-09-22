import { useMutation } from "@tanstack/react-query";
import { insert, update, softDelete } from "@/lib/db/local-database";
import { roundMoney } from "@/lib/utils/pos-calculations";

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
      const parsedAmount = parseFloat(formData.amount);
      // Defense in depth: the add/edit dialog already rejects a non-numeric
      // or non-positive amount before calling this mutation, but a REAL
      // money column shouldn't rely solely on the caller having validated -
      // and nothing upstream rounds to the cent, so float drift (e.g.
      // "12.1" + floating-point rounding) could otherwise land un-rounded.
      if (!(parsedAmount > 0)) {
        throw new Error("Expense amount must be a positive number");
      }
      const data = {
        ...formData,
        amount: roundMoney(parsedAmount),
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
    mutationFn: ({ id, amount, category }: QuickEditExpenseParams) => {
      if (!(amount > 0)) {
        throw new Error("Expense amount must be a positive number");
      }
      return update("expenses", id, { amount: roundMoney(amount), category });
    },
  });
}
