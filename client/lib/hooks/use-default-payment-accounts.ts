import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface DefaultPaymentAccountsState {
  defaults: Record<string, string>; // Format: "storeId_paymentMethod": "accountId"
  setDefaultAccount: (storeId: string, paymentMethod: string, accountId: string) => void;
  clearDefaultAccount: (storeId: string, paymentMethod: string) => void;
}

export const useDefaultPaymentAccounts = create<DefaultPaymentAccountsState>()(
  persist(
    (set) => ({
      defaults: {},
      setDefaultAccount: (storeId, paymentMethod, accountId) => 
        set((state) => ({
          defaults: {
            ...state.defaults,
            [`${storeId}_${paymentMethod}`]: accountId
          }
        })),
      clearDefaultAccount: (storeId, paymentMethod) => 
        set((state) => {
          const newDefaults = { ...state.defaults };
          delete newDefaults[`${storeId}_${paymentMethod}`];
          return { defaults: newDefaults };
        }),
    }),
    {
      name: 'dumos-default-payment-accounts',
    }
  )
);
