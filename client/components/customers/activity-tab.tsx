"use client";

import { Customer } from "@/lib/hooks/use-customer-data";

export function ActivityTab({ customers, currencyCode = "₦" }: { customers: Customer[], currencyCode?: string }) {
  // Mock activity from customer list join dates as a fallback for the UI
  const activities = customers.slice(0, 10).map(c => ({
    id: c.id,
    customerName: c.name,
    action: "Joined the loyalty program",
    date: c.joinDate,
    amount: null,
  }));

  return (
    <div className="bg-background border rounded-[14px] p-5 shadow-sm">
      <div className="flex justify-between items-center mb-6">
        <h3 className="text-[14px] font-semibold">Recent Activity</h3>
        <button className="text-[12px] font-medium text-primary hover:underline">View All</button>
      </div>
      
      {activities.length === 0 ? (
        <div className="text-center text-muted-foreground py-8 text-[13px]">
          No recent activity to show.
        </div>
      ) : (
        <div className="space-y-4">
          {activities.map((activity, index) => (
            <div key={activity.id + index} className="flex items-center gap-4 p-3 rounded-[10px] hover:bg-secondary/50 transition-colors">
              <div className="w-10 h-10 rounded-full bg-primary/10 text-primary flex items-center justify-center font-bold text-[14px]">
                {activity.customerName.substring(0, 2).toUpperCase()}
              </div>
              <div className="flex-1">
                <div className="text-[14px] font-semibold">{activity.customerName}</div>
                <div className="text-[12px] text-muted-foreground">{activity.action}</div>
              </div>
              <div className="text-right">
                {activity.amount && (
                  <div className="text-[14px] font-semibold">{currencyCode} {activity.amount}</div>
                )}
                <div className="text-[11px] text-muted-foreground">{activity.date}</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
