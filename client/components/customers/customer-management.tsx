"use client";

import { useState, useEffect } from "react";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useStore } from "@/lib/context/store-context";
import { useCustomerData, Customer } from "@/lib/hooks/use-customer-data";
import { genericFuzzySearch } from "@/lib/utils/search";
import { LoyaltyTiersView } from "./loyalty-tiers-view";
import { CustomerTransactions } from "./customer-transactions";
import { CustomerDetailsDialog } from "./customer-details-dialog";
import { DebtDashboard } from "./debt-dashboard";
import { CustomerStats } from "./customer-stats";
import { CustomerDirectory } from "./customer-directory";
import { LoyaltyRedemptionCard } from "./loyalty-redemption-card";
import { CustomerAnalyticsTab } from "./customer-analytics-tab";

export function CustomerManagement() {
  const { storeType, storeProfile } = useStore();
  const isStore = storeType === "pharmacy";

  const { customers, addCustomer, fetchCustomers } = useCustomerData();

  const loyaltyTiers = [
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
      benefits: ["Enhanced rewards", "Birthday discount 10%", "Priority support"],
      color: "bg-gray-400",
    },
    {
      name: "Gold",
      minSpent: 300000,
      pointsMultiplier: 2,
      benefits: [
        "Premium rewards",
        "Birthday discount 15%",
        "Free delivery",
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
        "Free delivery",
        isStore ? "Personal specialist" : "Shopping assistant",
        "Early access",
      ],
      color: "bg-purple-600",
    },
  ];

  const [searchTerm, setSearchTerm] = useState("");
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [isAddCustomerOpen, setIsAddCustomerOpen] = useState(false);

  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (searchParams.get("action") === "add") {
      setIsAddCustomerOpen(true);
      const newParams = new URLSearchParams(searchParams.toString());
      newParams.delete("action");
      const newUrl = pathname + (newParams.toString() ? `?${newParams.toString()}` : "");
      router.replace(newUrl);
    }
  }, [searchParams, router, pathname]);

  const handleAddCustomer = async (payload: any) => {
    await addCustomer(payload);
    setIsAddCustomerOpen(false);
  };

  const { results: filteredCustomers, isFuzzyFallback } = genericFuzzySearch(
    searchTerm,
    customers,
    ["name", "email", "phone"]
  );

  const getTierColor = (tier: string) => {
    const tierInfo = loyaltyTiers.find((t) => t.name === tier);
    return tierInfo?.color || "bg-gray-400";
  };

  return (
    <div className="space-y-6">
      <CustomerStats customers={customers} />

      <Tabs defaultValue="customers" className="space-y-6">
        <TabsList className="w-full md:w-max">
          <TabsTrigger value="customers">Customer Directory</TabsTrigger>
          <TabsTrigger value="debt">Debt Management</TabsTrigger>
          <TabsTrigger value="loyalty">Loyalty Program</TabsTrigger>
          <TabsTrigger value="transactions">Recent Activity</TabsTrigger>
          <TabsTrigger value="analytics">Customer Analytics</TabsTrigger>
        </TabsList>

        <TabsContent value="customers">
          <CustomerDirectory 
            customers={filteredCustomers}
            searchTerm={searchTerm}
            onSearchChange={setSearchTerm}
            isFuzzyFallback={isFuzzyFallback}
            onAddCustomer={handleAddCustomer}
            isAddCustomerOpen={isAddCustomerOpen}
            setIsAddCustomerOpen={setIsAddCustomerOpen}
            onViewDetails={setSelectedCustomer}
            getTierColor={getTierColor}
            currencyCode={storeProfile?.currency}
          />
        </TabsContent>

        <TabsContent value="debt" className="space-y-6">
          <DebtDashboard />
        </TabsContent>

        <TabsContent value="loyalty" className="space-y-6">
          <LoyaltyTiersView tiers={loyaltyTiers} />
          <LoyaltyRedemptionCard />
        </TabsContent>

        <TabsContent value="transactions" className="space-y-6">
          <CustomerTransactions />
        </TabsContent>

        <TabsContent value="analytics" className="space-y-6">
          <CustomerAnalyticsTab />
        </TabsContent>
      </Tabs>

      <CustomerDetailsDialog
        selectedCustomer={selectedCustomer}
        setSelectedCustomer={setSelectedCustomer}
        getTierColor={getTierColor}
        onRefresh={fetchCustomers}
      />
    </div>
  );
}
