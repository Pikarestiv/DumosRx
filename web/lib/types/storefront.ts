export interface StorefrontProduct {
  id: string;
  name: string;
  generic_name?: string;
  selling_price: string | number;
  requires_prescription?: boolean;
  category?: { name: string };
}
