import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { STORE_TYPES, type StoreType } from "@/lib/constants/store-types";

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
          {STORE_TYPES.map((vertical) => {
            const active = storeType === vertical.value;
            return (
              <button
                key={vertical.value}
                type="button"
                aria-pressed={active}
                onClick={() => handleSwitchVertical(vertical.value)}
                className={`flex flex-col items-center justify-center p-4 rounded-lg border-2 transition-all cursor-pointer ${
                  active
                    ? "border-primary bg-primary"
                    : "border-muted-foreground/10 hover:border-primary/30 hover:bg-primary/5"
                }`}
              >
                <vertical.icon
                  className={`h-6 w-6 mb-2 ${active ? "text-primary-foreground" : "text-primary"}`}
                />
                <span
                  className={`text-sm font-medium text-center ${active ? "text-primary-foreground" : ""}`}
                >
                  {vertical.label}
                </span>
              </button>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
