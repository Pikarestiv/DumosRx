export interface StorefrontProduct {
  id: string;
  name: string;
  generic_name?: string;
  selling_price: string | number;
  requires_prescription?: boolean;
  stock_quantity?: number;
  in_stock?: boolean;
  category?: { id?: string; name: string };
  image?: string | null;
}
