/**
 * Sample Data for Business Intelligence Dashboard
 */

export const inventoryAlerts = [
  {
    medicine: "Paracetamol 500mg",
    issue: "Low Stock",
    quantity: 45,
    threshold: 100,
    severity: "high",
  },
  {
    medicine: "Insulin Glargine",
    issue: "Expiring Soon",
    expiryDate: "2026-02-15",
    severity: "critical",
  },
  {
    medicine: "Amoxicillin 250mg",
    issue: "Low Stock",
    quantity: 78,
    threshold: 150,
    severity: "medium",
  },
  {
    medicine: "Vitamin D3",
    issue: "Expiring Soon",
    expiryDate: "2026-02-28",
    severity: "high",
  },
];

export const customerMetrics = [
  { metric: "Total Customers", value: "2,847", change: "+12.5%", trend: "up" },
  { metric: "Loyalty Members", value: "1,923", change: "+8.3%", trend: "up" },
  {
    metric: "Avg. Transaction",
    value: "₦15,420",
    change: "+5.2%",
    trend: "up",
  },
  {
    metric: "Customer Retention",
    value: "78.5%",
    change: "-2.1%",
    trend: "down",
  },
];
