import { Pill, ShoppingBasket, ShoppingCart, Check } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { StoreType } from "@/lib/context/store-context";

interface BusinessVerticalCardProps {
  storeType: StoreType;
  handleSwitchVertical: (type: StoreType) => void;
}

export function BusinessVerticalCard({
  storeType,
  handleSwitchVertical,
}: BusinessVerticalCardProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Business Vertical</CardTitle>
        <CardDescription>
          Switching modes changes the terminology and active modules.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { id: "pharmacy", label: "Pharmacy", icon: Pill },
            { id: "grocery", label: "Grocery", icon: ShoppingBasket },
            {
              id: "supermarket",
              label: "Supermarket",
              icon: ShoppingCart,
            },
            { id: "general", label: "General", icon: Check },
          ].map((vertical) => (
            <button
              key={vertical.id}
              onClick={() => handleSwitchVertical(vertical.id as StoreType)}
              className={`flex flex-col items-center justify-center p-4 rounded-lg border-2 transition-all cursor-pointer ${
                storeType === vertical.id
                  ? "border-primary bg-primary/5"
                  : "border-muted hover:border-primary/50"
              }`}
            >
              <vertical.icon className="h-6 w-6 mb-2 text-primary" />
              <span className="text-sm font-medium">{vertical.label}</span>
            </button>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
