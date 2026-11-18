import type { ProductViewModel } from "@/lib/types/product";
import type { POProduct } from "@/lib/db/queries/procurement";
import type { POLineItemDraft } from "./po-item-ledger-table";

export interface POCreateViewProps {
  selectedSupplierName: string;
  paymentStatus: string;
  dueDate: string;
  amountPaid: string;
  totalAmount: number;
  products: POProduct[];
  onOpenAddProduct: (productData: Partial<ProductViewModel>) => void;
  newlyCreatedProductId: string | null;
  onNewlyCreatedProductConsumed: () => void;
  canEditProducts?: boolean;
  canReceive: boolean;
  isWalkIn: boolean;
  items: POLineItemDraft[];
  onItemsChange: (items: POLineItemDraft[]) => void;
  isSubmitting: boolean;
  handleReceive: () => void;
  handleSend: () => void;
  handleSaveDraft: () => void;
  setIsEditDetailsOpen: (open: boolean) => void;
}
