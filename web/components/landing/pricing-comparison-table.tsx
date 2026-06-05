import React from "react";

export function PricingComparisonTable() {
  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="text-center space-y-2">
        <h3 className="text-2xl font-bold tracking-tight">
          Plan Features Comparison
        </h3>
        <p className="text-sm text-muted-foreground">
          Compare all tools, limits, and sync features across our four
          pricing tiers.
        </p>
      </div>

      <div className="overflow-hidden border border-muted rounded-2xl shadow-sm bg-background">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left text-sm">
            <thead>
              <tr className="bg-muted/50 border-b border-muted">
                <th className="p-4 font-bold text-foreground">Feature</th>
                <th className="p-4 font-bold text-foreground text-center">
                  Free Standalone
                </th>
                <th className="p-4 font-bold text-foreground text-center">
                  Starter Cloud
                </th>
                <th className="p-4 font-bold text-foreground text-center bg-primary/5 text-primary">
                  Pro Connect
                </th>
                <th className="p-4 font-bold text-foreground text-center">
                  Enterprise HQ
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-muted">
              {/* Category: Devices & Scale */}
              <tr className="bg-muted/10 font-semibold">
                <td
                  colSpan={5}
                  className="p-3 text-xs uppercase tracking-wider text-muted-foreground"
                >
                  Deployments & Scale
                </td>
              </tr>
              <tr>
                <td className="p-4 font-medium text-foreground">
                  Supported Devices
                </td>
                <td className="p-4 text-center text-muted-foreground">
                  1 Device (Standalone)
                </td>
                <td className="p-4 text-center text-muted-foreground">
                  1 Host + 2 Cashier LAN
                </td>
                <td className="p-4 text-center text-muted-foreground font-medium text-foreground bg-primary/5">
                  Unlimited LAN Terminals
                </td>
                <td className="p-4 text-center text-muted-foreground">
                  Unlimited / Multi-Store
                </td>
              </tr>
              <tr>
                <td className="p-4 font-medium text-foreground">
                  Max Staff Accounts
                </td>
                <td className="p-4 text-center text-muted-foreground">
                  1 User (Owner)
                </td>
                <td className="p-4 text-center text-muted-foreground">
                  3 Staff Users
                </td>
                <td className="p-4 text-center text-muted-foreground font-medium text-foreground bg-primary/5">
                  10 Staff Users
                </td>
                <td className="p-4 text-center text-muted-foreground">
                  Unlimited
                </td>
              </tr>

              {/* Category: Sync & Cloud */}
              <tr className="bg-muted/10 font-semibold">
                <td
                  colSpan={5}
                  className="p-3 text-xs uppercase tracking-wider text-muted-foreground"
                >
                  Cloud Services & Sync
                </td>
              </tr>
              <tr>
                <td className="p-4 font-medium text-foreground">
                  Cloud Sync Frequency
                </td>
                <td className="p-4 text-center text-muted-foreground">
                  ❌ No Cloud Sync
                </td>
                <td className="p-4 text-center text-muted-foreground">
                  Scheduled (Every 6 Hours)
                </td>
                <td className="p-4 text-center text-muted-foreground font-medium text-foreground bg-primary/5">
                  Automated (Every 15 mins)
                </td>
                <td className="p-4 text-center text-muted-foreground">
                  Real-time (Instant)
                </td>
              </tr>
              <tr>
                <td className="p-4 font-medium text-foreground">
                  Web Dashboard Analytics
                </td>
                <td className="p-4 text-center text-muted-foreground">
                  ❌ No Dashboard
                </td>
                <td className="p-4 text-center text-muted-foreground">
                  Restricted (6-Hour Delay)
                </td>
                <td className="p-4 text-center text-muted-foreground font-medium text-foreground bg-primary/5">
                  Full Analytics (15-min Delay)
                </td>
                <td className="p-4 text-center text-muted-foreground">
                  Real-time HQ Console
                </td>
              </tr>
              <tr>
                <td className="p-4 font-medium text-foreground">
                  Mobile Companion App
                </td>
                <td className="p-4 text-center text-muted-foreground">
                  ❌ No Access
                </td>
                <td className="p-4 text-center text-muted-foreground">
                  ❌ No Access
                </td>
                <td className="p-4 text-center text-muted-foreground font-medium text-foreground bg-primary/5">
                  ✅ Fully Enabled
                </td>
                <td className="p-4 text-center text-muted-foreground">
                  ✅ Fully Enabled
                </td>
              </tr>

              {/* Category: Advanced Features */}
              <tr className="bg-muted/10 font-semibold">
                <td
                  colSpan={5}
                  className="p-3 text-xs uppercase tracking-wider text-muted-foreground"
                >
                  Advanced Store Modules
                </td>
              </tr>
              <tr>
                <td className="p-4 font-medium text-foreground">
                  Prescriptions & Expenses
                </td>
                <td className="p-4 text-center text-muted-foreground">
                  ❌ Grayed Out (Locked)
                </td>
                <td className="p-4 text-center text-muted-foreground">
                  ✅ Included
                </td>
                <td className="p-4 text-center text-muted-foreground font-medium text-foreground bg-primary/5">
                  ✅ Included
                </td>
                <td className="p-4 text-center text-muted-foreground">
                  ✅ Included
                </td>
              </tr>
              <tr>
                <td className="p-4 font-medium text-foreground">
                  Smart POS Suggestions
                </td>
                <td className="p-4 text-center text-muted-foreground">
                  ❌ Locked
                </td>
                <td className="p-4 text-center text-muted-foreground">
                  ❌ Locked
                </td>
                <td className="p-4 text-center text-muted-foreground font-medium text-foreground bg-primary/5">
                  ✅ AI Cross-sell Engine
                </td>
                <td className="p-4 text-center text-muted-foreground">
                  ✅ Custom Models Enabled
                </td>
              </tr>
              <tr>
                <td className="p-4 font-medium text-foreground">
                  Store Theme Customizer
                </td>
                <td className="p-4 text-center text-muted-foreground">
                  Locked to Blue/Light Mode
                </td>
                <td className="p-4 text-center text-muted-foreground">
                  ✅ All Themes & Dark Mode
                </td>
                <td className="p-4 text-center text-muted-foreground font-medium text-foreground bg-primary/5">
                  ✅ All Themes & Dark Mode
                </td>
                <td className="p-4 text-center text-muted-foreground">
                  ✅ Custom White-Labeling
                </td>
              </tr>
              <tr>
                <td className="p-4 font-medium text-foreground">
                  E-Commerce E-store URL
                </td>
                <td className="p-4 text-center text-muted-foreground">
                  ❌ Locked
                </td>
                <td className="p-4 text-center text-muted-foreground">
                  ❌ Locked
                </td>
                <td className="p-4 text-center text-muted-foreground font-medium text-foreground bg-primary/5">
                  ✅ Custom Online URL
                </td>
                <td className="p-4 text-center text-muted-foreground">
                  ✅ API Integrations Included
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
