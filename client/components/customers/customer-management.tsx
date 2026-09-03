"use client";

import { Tabs, TabsContent } from "@/components/ui/tabs";
import { useCustomerManagement } from "@/lib/hooks/use-customer-management";
import { LockedModuleOverlay } from "@/components/dashboard/locked-module-overlay";

import { InsightsStrip } from "./insights-strip";
import { OverviewTab } from "./overview-tab";
import { DirectoryTab } from "./directory-tab";
import { ActivityTab } from "./activity-tab";
import { LoyaltyTab } from "./loyalty-tab";
import { AddCustomerModal } from "./add-customer-modal";
import { EditCustomerModal } from "./edit-customer-modal";
import { RecordPaymentModal } from "./record-payment-modal";
import { CustomerTabNav } from "./customer-tab-nav";

export function CustomerManagement() {
  const {
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
  } = useCustomerManagement();

  return (
    <div className="flex flex-col h-full min-h-0 space-y-4 md:space-y-6">
      <Tabs
        value={activeTab}
        onValueChange={handleTabChange}
        className="flex-1 flex flex-col min-h-0 gap-4"
      >
        <CustomerTabNav />

        <TabsContent
          value="overview"
          className="flex-1 min-h-0 mt-0 border-none p-0 flex flex-col gap-4 md:gap-6"
        >
          <InsightsStrip metrics={metrics} />
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
          className="relative flex-1 min-h-0 mt-0 border-none p-0"
        >
          <LockedModuleOverlay
            featureName="Loyalty Program"
            featureKey="loyalty_program"
          />
          <LoyaltyTab
            tiers={loyaltyTiers}
            currencyCode={storeProfile?.currency}
          />
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
