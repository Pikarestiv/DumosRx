"use client";

import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useStore } from "@/lib/context/store-context";
import { useCustomerData, Customer } from "@/lib/hooks/use-customer-data";
import { genericFuzzySearch } from "@/lib/utils/search";
import { getLoyaltyTiers } from "@/lib/db/queries/loyalty";

import { InsightsStrip } from "./insights-strip";
import { OverviewTab } from "./overview-tab";
import { DirectoryTab } from "./directory-tab";
import { ActivityTab } from "./activity-tab";
import { LoyaltyTab } from "./loyalty-tab";
import { AddCustomerModal } from "./add-customer-modal";
import { EditCustomerModal } from "./edit-customer-modal";
import { RecordPaymentModal } from "./record-payment-modal";
import { ResponsiveTabLabel } from "@/components/ui/responsive-tab-label";

export function CustomerManagement() {
  const { storeType, storeProfile } = useStore();
  const isStore = storeType === "pharmacy";

  const { customers, metrics, addCustomer, updateCustomer, recordPayment } =
    useCustomerData();

  const FALLBACK_TIERS = [
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

  const { data: dbTiers } = useQuery({
    queryKey: ["loyalty_tiers"],
    queryFn: getLoyaltyTiers,
  });

  const loyaltyTiers = dbTiers && dbTiers.length > 0
    ? dbTiers
        .map((t) => ({
          name: t.name,
          minSpent: t.min_spend,
          pointsMultiplier: t.points_multiplier,
          benefits: JSON.parse(t.benefits || "[]") as string[],
          color: t.color,
        }))
        .sort((a, b) => a.minSpent - b.minSpent)
    : FALLBACK_TIERS;

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

  const handleAddCustomer = async (payload: any) => {
    await addCustomer(payload);
    setIsAddCustomerOpen(false);
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
    const updated = await recordPayment(payingCustomer.id, amount, paymentMethod, notes);
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

  const handleTabChange = (value: string) => {
    setActiveTab(value);
    const newParams = new URLSearchParams(searchParams.toString());
    newParams.set("tab", value);
    router.replace(`${pathname}?${newParams.toString()}`, { scroll: false });
  };

  return (
    <div className="flex flex-col h-full min-h-0 space-y-4 md:space-y-6">
      <InsightsStrip metrics={metrics} />

      <Tabs
        value={activeTab}
        onValueChange={handleTabChange}
        className="flex-1 flex flex-col min-h-0 gap-4"
      >
        <TabsList className="w-full md:w-max bg-background border rounded-[11px] p-1 h-auto overflow-x-auto justify-start">
          <TabsTrigger
            value="overview"
            className="rounded-lg text-[13px] font-semibold data-[state=active]:bg-primary data-[state=active]:text-primary-foreground px-5 py-2"
          >
            Overview
          </TabsTrigger>
          <TabsTrigger
            value="directory"
            className="rounded-lg text-[13px] font-semibold data-[state=active]:bg-primary data-[state=active]:text-primary-foreground px-5 py-2"
          >
            Directory
          </TabsTrigger>
          <TabsTrigger
            value="activity"
            className="rounded-lg text-[13px] font-semibold data-[state=active]:bg-primary data-[state=active]:text-primary-foreground px-5 py-2"
          >
            Activity
          </TabsTrigger>
          <TabsTrigger
            value="loyalty"
            className="rounded-lg text-[13px] font-semibold data-[state=active]:bg-primary data-[state=active]:text-primary-foreground px-5 py-2"
          >
            <ResponsiveTabLabel short="Loyalty" long="Loyalty Program" />
          </TabsTrigger>
        </TabsList>

        <TabsContent
          value="overview"
          className="flex-1 min-h-0 mt-0 border-none p-0"
        >
          <OverviewTab metrics={metrics} />
        </TabsContent>

        <TabsContent
          value="directory"
          className="flex-1 min-h-0 mt-0 border-none p-0"
        >
          <DirectoryTab
            customers={filteredCustomers}
            searchTerm={searchTerm}
            onSearchChange={setSearchTerm}
            selectedCustomer={selectedCustomer}
            setSelectedCustomer={setSelectedCustomer}
            getTierColor={getTierColor}
            currencyCode={storeProfile?.currency}
            onViewHistory={handleViewHistory}
            onEditProfile={setEditingCustomer}
            onRecordPayment={setPayingCustomer}
          />
        </TabsContent>

        <TabsContent
          value="activity"
          className="flex-1 min-h-0 mt-0 border-none p-0"
        >
          <ActivityTab
            currencyCode={storeProfile?.currency}
            filterCustomerId={activityFilterCustomer?.id}
            filterCustomerName={activityFilterCustomer?.name}
            onClearFilter={() => setActivityFilterCustomer(null)}
          />
        </TabsContent>

        <TabsContent
          value="loyalty"
          className="flex-1 min-h-0 mt-0 border-none p-0"
        >
          <LoyaltyTab tiers={loyaltyTiers} currencyCode={storeProfile?.currency} />
        </TabsContent>
      </Tabs>

      <AddCustomerModal
        isOpen={isAddCustomerOpen}
        onClose={() => setIsAddCustomerOpen(false)}
        onSubmit={handleAddCustomer}
      />

      <EditCustomerModal
        customer={editingCustomer}
        onClose={() => setEditingCustomer(null)}
        onSubmit={handleUpdateCustomer}
      />

      <RecordPaymentModal
        customer={payingCustomer}
        currencyCode={storeProfile?.currency}
        onClose={() => setPayingCustomer(null)}
        onSubmit={handleRecordPayment}
      />
    </div>
  );
}
