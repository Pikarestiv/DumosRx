"use client";

import { useState } from "react";
import { Customer } from "@/lib/hooks/use-customer-data";

interface DirectoryTabProps {
  customers: Customer[];
  searchTerm: string;
  onSearchChange: (val: string) => void;
  selectedCustomer: Customer | null;
  setSelectedCustomer: (c: Customer | null) => void;
  getTierColor: (tier: string) => string;
  currencyCode?: string;
}

export function DirectoryTab({
  customers,
  searchTerm,
  onSearchChange,
  selectedCustomer,
  setSelectedCustomer,
  getTierColor,
  currencyCode = "₦",
}: DirectoryTabProps) {
  
  return (
    <div className="flex h-full gap-4 relative">
      {/* List Panel - Hidden on mobile if a customer is selected */}
      <div className={`flex-col bg-background border rounded-[14px] shadow-sm ${selectedCustomer ? 'hidden md:flex' : 'flex'} w-full md:w-1/3 flex-shrink-0 h-[600px] overflow-hidden`}>
        <div className="p-4 border-b">
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </span>
            <input 
              type="text" 
              placeholder="Search customers..." 
              value={searchTerm}
              onChange={e => onSearchChange(e.target.value)}
              className="w-full bg-secondary/50 border-none rounded-[10px] pl-9 pr-4 py-2 text-[13px] focus:ring-1 focus:ring-primary outline-none"
            />
          </div>
        </div>
        <div className="overflow-y-auto flex-1 p-2 space-y-1">
          {customers.map(customer => (
            <div 
              key={customer.id} 
              onClick={() => setSelectedCustomer(customer)}
              className={`flex items-center justify-between p-3 rounded-[10px] cursor-pointer hover:bg-secondary/50 transition-colors ${selectedCustomer?.id === customer.id ? 'bg-secondary' : ''}`}
            >
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-primary/10 text-primary flex items-center justify-center font-bold text-[14px]">
                  {customer.name.substring(0, 2).toUpperCase()}
                </div>
                <div>
                  <div className="text-[14px] font-semibold">{customer.name}</div>
                  <div className="text-[12px] text-muted-foreground">{customer.phone || customer.email || 'No contact info'}</div>
                </div>
              </div>
              <div className={`text-[10px] font-medium px-2 py-1 rounded-full text-white ${getTierColor(customer.tier)}`}>
                {customer.tier}
              </div>
            </div>
          ))}
          {customers.length === 0 && (
            <div className="p-8 text-center text-muted-foreground text-[13px]">
              No customers found.
            </div>
          )}
        </div>
      </div>

      {/* Details Panel - Full width on mobile, 2/3 on desktop */}
      <div className={`flex-col bg-background border rounded-[14px] shadow-sm flex-1 ${!selectedCustomer ? 'hidden md:flex items-center justify-center' : 'flex'}`}>
        {!selectedCustomer ? (
          <div className="text-center text-muted-foreground">
            <svg className="w-12 h-12 mx-auto mb-3 opacity-20" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
            </svg>
            <p className="text-[14px]">Select a customer to view details</p>
          </div>
        ) : (
          <div className="flex flex-col h-full overflow-hidden">
            <div className="p-5 border-b flex justify-between items-start">
              <div className="flex items-center gap-4">
                <button 
                  className="md:hidden p-2 -ml-2 text-muted-foreground hover:text-foreground"
                  onClick={() => setSelectedCustomer(null)}
                >
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                  </svg>
                </button>
                <div className="w-16 h-16 rounded-full bg-primary/10 text-primary flex items-center justify-center font-bold text-[24px]">
                  {selectedCustomer.name.substring(0, 2).toUpperCase()}
                </div>
                <div>
                  <h2 className="text-[20px] font-bold flex items-center gap-2">
                    {selectedCustomer.name}
                    <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full text-white align-middle ${getTierColor(selectedCustomer.tier)}`}>
                      {selectedCustomer.tier}
                    </span>
                  </h2>
                  <div className="text-[13px] text-muted-foreground mt-1 flex items-center gap-4">
                    <span>{selectedCustomer.phone}</span>
                    {selectedCustomer.email && <span>{selectedCustomer.email}</span>}
                  </div>
                </div>
              </div>
              <div className="flex gap-2">
                <button className="px-3 py-1.5 border rounded-[8px] text-[12px] font-medium hover:bg-secondary transition-colors">Edit</button>
              </div>
            </div>
            
            <div className="flex-1 overflow-y-auto p-5">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Profile Information */}
                <div>
                  <h3 className="text-[14px] font-semibold mb-3">Profile Information</h3>
                  <div className="space-y-3 bg-secondary/30 rounded-[10px] p-4">
                    <div>
                      <div className="text-[11px] text-muted-foreground mb-0.5">Address</div>
                      <div className="text-[13px]">{selectedCustomer.address || "Not provided"}</div>
                    </div>
                    <div>
                      <div className="text-[11px] text-muted-foreground mb-0.5">Date of Birth</div>
                      <div className="text-[13px]">{selectedCustomer.birthday || "Not provided"}</div>
                    </div>
                    <div>
                      <div className="text-[11px] text-muted-foreground mb-0.5">Joined</div>
                      <div className="text-[13px]">{selectedCustomer.joinDate}</div>
                    </div>
                  </div>
                </div>

                {/* Account Summary */}
                <div>
                  <h3 className="text-[14px] font-semibold mb-3">Account Summary</h3>
                  <div className="space-y-3 bg-secondary/30 rounded-[10px] p-4">
                    <div>
                      <div className="text-[11px] text-muted-foreground mb-0.5">Total Spent</div>
                      <div className="text-[13px] font-medium">{currencyCode} {selectedCustomer.totalSpent.toLocaleString(undefined, { minimumFractionDigits: 2 })}</div>
                    </div>
                    <div>
                      <div className="text-[11px] text-muted-foreground mb-0.5">Loyalty Points</div>
                      <div className="text-[13px] font-medium text-emerald-600">{selectedCustomer.points.toLocaleString()} pts</div>
                    </div>
                    <div>
                      <div className="text-[11px] text-muted-foreground mb-0.5">Outstanding Balance (Debt)</div>
                      <div className={`text-[13px] font-medium ${selectedCustomer.outstanding_balance > 0 ? 'text-destructive' : 'text-muted-foreground'}`}>
                        {currencyCode} {selectedCustomer.outstanding_balance.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Debt Management Section */}
              {selectedCustomer.outstanding_balance > 0 && (
                <div className="mt-6 border border-destructive/20 bg-destructive/5 rounded-[12px] p-5">
                  <div className="flex justify-between items-start mb-4">
                    <div>
                      <h3 className="text-[14px] font-semibold text-destructive flex items-center gap-2">
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        Outstanding Debt
                      </h3>
                      <div className="text-[12px] text-muted-foreground mt-1">
                        This customer has an unpaid balance.
                      </div>
                    </div>
                    <div className="text-[20px] font-bold text-destructive">
                      {currencyCode} {selectedCustomer.outstanding_balance.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                    </div>
                  </div>
                  <div className="flex gap-3">
                    <button className="bg-destructive text-destructive-foreground px-4 py-2 rounded-[8px] text-[13px] font-semibold hover:bg-destructive/90 transition-colors">
                      Record Payment
                    </button>
                    <button className="bg-background border px-4 py-2 rounded-[8px] text-[13px] font-semibold hover:bg-secondary transition-colors">
                      Send Reminder
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
