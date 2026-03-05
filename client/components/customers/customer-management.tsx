"use client";

import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useStore } from "@/lib/context/store-context";
import { useCustomerData, Customer } from "@/lib/hooks/use-customer-data";
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
  const isPharmacy = storeType === "pharmacy";

  const { customers, addCustomer } = useCustomerData();

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
        isPharmacy ? "Personal pharmacist" : "Shopping assistant",
        "Early access",
      ],
      color: "bg-purple-600",
    },
  ];

  const [searchTerm, setSearchTerm] = useState("");
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [isAddCustomerOpen, setIsAddCustomerOpen] = useState(false);

  const handleAddCustomer = async (payload: any) => {
    await addCustomer(payload);
    setIsAddCustomerOpen(false);
  };

  const filteredCustomers = customers.filter(
    (customer) =>
      customer.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      customer.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
      customer.phone.includes(searchTerm),
  );

  const getTierColor = (tier: string) => {
    const tierInfo = loyaltyTiers.find((t) => t.name === tier);
    return tierInfo?.color || "bg-gray-400";
  };

  return (
    <div className="space-y-6">
      <CustomerStats customers={customers} />

      <Tabs defaultValue="customers" className="space-y-6">
        <TabsList className="grid w-full grid-cols-5">
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
      />
    </div>
  );
}
