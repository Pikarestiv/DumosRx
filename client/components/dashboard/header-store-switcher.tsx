import { Store as StoreIcon, ChevronDown, Check } from "lucide-react";
import { APP_NAME } from "@/lib/constants";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { StoreProfile } from "@/lib/context/store-context";

interface HeaderStoreSwitcherProps {
  storeProfile: StoreProfile | null;
  availableStores: StoreProfile[];
  activeStoreId: string | null;
  onSwitchStore: (storeId: string) => void;
}

/** The store name in the header's top-left corner: a plain label for
 * single-store accounts, or a switcher dropdown once there's more than one
 * store to pick from. */
export function HeaderStoreSwitcher({
  storeProfile,
  availableStores,
  activeStoreId,
  onSwitchStore,
}: HeaderStoreSwitcherProps) {
  if (availableStores.length <= 1) {
    return (
      <div className="flex items-center gap-1 font-medium text-foreground">
        <StoreIcon className="h-3 w-3" />
        <span className="truncate max-w-[40vw] sm:max-w-[200px]">
          {storeProfile?.name || APP_NAME}
        </span>
      </div>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button className="flex items-center gap-1 font-medium text-foreground hover:text-primary transition-colors outline-none">
          <StoreIcon className="h-3 w-3" />
          <span className="truncate max-w-[40vw] sm:max-w-[200px]">
            {storeProfile?.name || APP_NAME}
          </span>
          <ChevronDown className="h-3 w-3 shrink-0" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-56">
        {availableStores.map((store) => (
          <DropdownMenuItem
            key={store.id}
            onClick={() => onSwitchStore(store.id)}
            className="flex items-center justify-between gap-2"
          >
            <span className="truncate">{store.name}</span>
            {(activeStoreId ?? storeProfile?.id) === store.id && (
              <Check className="h-3.5 w-3.5 text-primary shrink-0" />
            )}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
