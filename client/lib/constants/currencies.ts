export interface CurrencyOption {
  code: string;
  name: string;
  symbol: string;
}

export const DEFAULT_CURRENCY_CODE = "NGN";

/** Canonical currency list — single source of truth for code/name/symbol across the app. */
export const CURRENCIES: CurrencyOption[] = [
  { code: "NGN", name: "Nigerian Naira", symbol: "₦" },
  { code: "USD", name: "US Dollar", symbol: "$" },
  { code: "GBP", name: "British Pound", symbol: "£" },
  { code: "EUR", name: "Euro", symbol: "€" },
  { code: "GHS", name: "Ghanaian Cedi", symbol: "₵" },
  { code: "KES", name: "Kenyan Shilling", symbol: "KSh" },
  { code: "ZAR", name: "South African Rand", symbol: "R" },
  { code: "XOF", name: "West African CFA Franc", symbol: "CFA" },
];

export function getCurrencyByCode(code?: string | null): CurrencyOption {
  return (
    CURRENCIES.find((c) => c.code === code) ||
    CURRENCIES.find((c) => c.code === DEFAULT_CURRENCY_CODE)!
  );
}
