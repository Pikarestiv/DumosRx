import { Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";

interface EditProductPencilProps {
  productName: string;
  hasTouchCapability: boolean;
  onClick: () => void;
}

export function EditProductPencil({ productName, hasTouchCapability, onClick }: EditProductPencilProps) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      aria-label={`Edit ${productName}`}
      title="Edit product"
      className={`h-6 w-6 shrink-0 text-muted-foreground hover:bg-primary hover:text-primary-foreground ${
        hasTouchCapability ? "opacity-60" : "opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
      }`}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
    >
      <Pencil className="w-3 h-3" />
    </Button>
  );
}
