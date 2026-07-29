import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import { useStore } from "@/lib/context/store-context";
import { useCustomerData, Customer } from "@/lib/hooks/use-customer-data";
import { genericFuzzySearch } from "@/lib/utils/search";
import { getLoyaltyTiers } from "@/lib/db/queries/loyalty";
import { usePullToRefreshHandler } from "@/lib/context/pull-to-refresh-context";
import { queryKeys } from "@/lib/query-keys";

interface LoyaltyTier {
  name: string;
  minSpent: number;
  pointsMultiplier: number;
  benefits: string[];
  color: string;
}

function buildFallbackTiers(isStore: boolean): LoyaltyTier[] {
  return [
    {
      name: "Bronze",
      minSpent: 0,
      pointsMultiplier: 1,
      benefits: ["Basic rewards", "Birthday discount 5%"],
      color: "bg-amber-600",
    },
    {
      name: "Silver",
      minSpent: 100000,
      pointsMultiplier: 1.5,
      benefits: [
        "Enhanced rewards",
        "Birthday discount 10%",
        "Priority support",
      ],
      color: "bg-gray-400",
    },
    {
      name: "Gold",
      minSpent: 300000,
      pointsMultiplier: 2,
      benefits: [
        "Premium rewards",
        "Birthday discount 15%",
        "Exclusive offers",
      ],
      color: "bg-yellow-500",
    },
    {
      name: "Platinum",
      minSpent: 500000,
      pointsMultiplier: 3,
      benefits: [
        "VIP rewards",
        "Birthday discount 20%",
        isStore ? "Personal specialist" : "Shopping assistant",
        "Early access",
      ],
      color: "bg-purple-600",
    },
  ];
}

/**
 * All business logic for the Customer Management page — data fetching, tab/URL
 * sync, search/filter derivation, and modal/selection state — so the component
 * itself only has to render what this hook returns.
 */
export function useCustomerManagement() {
  const { storeType, storeProfile } = useStore();
  const isStore = storeType === "pharmacy";

  const { customers, metrics, fetchCustomers, addCustomer, updateCustomer, recordPayment } =
    useCustomerData();

  usePullToRefreshHandler(fetchCustomers);

  const { data: dbTiers } = useQuery({
    ...queryKeys.loyalty.tiers(),
    queryFn: getLoyaltyTiers,
  });

  const loyaltyTiers: LoyaltyTier[] =
    dbTiers && dbTiers.length > 0
      ? dbTiers
          .map((t) => ({
            name: t.name,
            minSpent: t.min_spend,
            pointsMultiplier: t.points_multiplier,
            benefits: JSON.parse(t.benefits || "[]") as string[],
            color: t.color,
          }))
          .sort((a, b) => a.minSpent - b.minSpent)
      : buildFallbackTiers(isStore);

  const [searchTerm, setSearchTerm] = useState("");
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(
    null,
  );
  const [isAddCustomerOpen, setIsAddCustomerOpen] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);
  const [payingCustomer, setPayingCustomer] = useState<Customer | null>(null);
  const [activityFilterCustomer, setActivityFilterCustomer] =
    useState<Customer | null>(null);

  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  const tabParam = searchParams.get("tab") || "overview";
  const [activeTab, setActiveTab] = useState(tabParam);

  useEffect(() => {
    if (searchParams.get("action") === "add") {
      setIsAddCustomerOpen(true);
      const newParams = new URLSearchParams(searchParams.toString());
      newParams.delete("action");
      const newUrl =
        pathname + (newParams.toString() ? `?${newParams.toString()}` : "");
      router.replace(newUrl);
    }
  }, [searchParams, router, pathname]);

  const handleTabChange = (value: string) => {
    setActiveTab(value);
    const newParams = new URLSearchParams(searchParams.toString());
    newParams.set("tab", value);
    router.replace(`${pathname}?${newParams.toString()}`, { scroll: false });
  };

  const handleAddCustomer = async (payload: any) => {
    const newCustomer = await addCustomer(payload);
    setIsAddCustomerOpen(false);
    if (newCustomer) {
      setSelectedCustomer(newCustomer);
      if (activeTab !== "directory") {
        handleTabChange("directory");
      }
    }
  };

  const handleUpdateCustomer = async (payload: any) => {
    if (!editingCustomer) return;
    const updated = await updateCustomer(editingCustomer.id, payload);
    if (updated) {
      setSelectedCustomer(updated);
      if (activityFilterCustomer?.id === updated.id) {
        setActivityFilterCustomer(updated);
      }
    }
    setEditingCustomer(null);
  };

  const handleViewHistory = (customer: Customer) => {
    setActivityFilterCustomer(customer);
    handleTabChange("activity");
  };

  const handleRecordPayment = async (
    amount: number,
    paymentMethod: string,
    notes: string,
  ) => {
    if (!payingCustomer) return;
    const updated = await recordPayment(
      payingCustomer.id,
      amount,
      paymentMethod,
      notes,
    );
    if (updated) {
      setSelectedCustomer(updated);
    }
    setPayingCustomer(null);
  };

  const { results: filteredCustomers } = genericFuzzySearch(
    searchTerm,
    customers,
    ["name", "email", "phone"],
  );

  const getTierColor = (tier: string) => {
    const tierInfo = loyaltyTiers.find((t) => t.name === tier);
    return tierInfo?.color || "bg-gray-400";
  };

  return {
    storeProfile,
    metrics,
    loyaltyTiers,
    filteredCustomers,
    getTierColor,

    activeTab,
    handleTabChange,

    searchTerm,
    setSearchTerm,

    selectedCustomer,
    setSelectedCustomer,
    activityFilterCustomer,
    setActivityFilterCustomer,

    isAddCustomerOpen,
    setIsAddCustomerOpen,
    editingCustomer,
    setEditingCustomer,
    payingCustomer,
    setPayingCustomer,

    handleAddCustomer,
    handleUpdateCustomer,
    handleViewHistory,
    handleRecordPayment,
  };
}
