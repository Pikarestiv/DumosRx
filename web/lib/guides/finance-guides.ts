import type { GuideItem } from "./types";

export const FINANCE_GUIDES: GuideItem[] = [
  {
    id: "daily-close",
    title: "Daily Close & Shift Reconciliation: Calculate Exact Net Cash Expected",
    category: "Reports & Finance",
    badge: "Financial Control",
    readTime: "3 min read",
    videoDuration: "2:20",
    summary:
      "Close the register at the end of each shift or business day. The system subtracts cash expenses from gross cash sales, showing the exact physical cash you should find in the drawer.",
    steps: [
      "At shift end, navigate to Reports > Daily Close.",
      "Review the financial summary: Total Sales, Cash Collected, Card/Transfers, Refunds, and Cash Expenses.",
      "Inspect 'Net Cash Expected' to see the exact cash that should remain physically in the till drawer.",
      "Enter your counted physical cash. DumosRx calculates any variance (balanced, overage, or shortage) and archives the signed Z-report.",
    ],
    proTip:
      "Tap 'Net Cash Expected' or 'Profit after expenses' to view an itemized breakdown of every single transaction and payout that went into that figure.",
    videoPlaceholderText: "Video Walkthrough: Running daily close, reconciling drawer cash, and generating Z-reports",
  },
  {
    id: "expense-amortization",
    title: "Expense Tracking & Amortization: Log Outgoings & Spread Prepaid Costs",
    category: "Reports & Finance",
    badge: "Accounting",
    readTime: "2 min read",
    videoDuration: "1:45",
    summary:
      "Track daily shop spending, utilities, and runner transport. Spread large upfront prepaid costs (like annual rent) evenly across monthly profit statements.",
    steps: [
      "Open Expenses and tap 'Add Expense'.",
      "Enter the amount, category (e.g. Generator Fuel, Cleaning, Packaging, Rent), and payment method.",
      "If the expense covers multiple months (such as quarterly or annual rent), enter the number of months in 'Spread over how many months?'.",
      "Save the expense. Full cash is deducted immediately from the drawer on payment day, while P&L reports amortize the cost evenly across months.",
    ],
    proTip:
      "Amortization ensures a single annual rent payment in January doesn't distort your monthly profitability throughout the rest of the year.",
    videoPlaceholderText: "Video Walkthrough: Logging expenses, cash vs bank payouts, and prepaid cost amortization",
  },
  {
    id: "in-app-assistant",
    title: "In-App AI Assistant: Instant Natural Language Guidance (100% Offline)",
    category: "Reports & Finance",
    badge: "Smart OS",
    readTime: "2 min read",
    videoDuration: "1:30",
    summary:
      "Ask questions in plain English directly on your store computer — even with zero internet. The assistant answers questions about sales, low stock, and how to use any feature.",
    steps: [
      "Tap the Assistant lightbulb icon in the header or select 'Ask the assistant' from the account menu.",
      "Ask a how-to question (e.g. 'How do I add a product?' or 'How do I run daily close?') to get step-by-step guidance and a direct navigation button.",
      "Ask an inventory question (e.g. 'What is low on stock?' or 'How much paracetamol do we have?') to get real-time answers from your catalog.",
      "Ask a sales question (e.g. 'What did I sell today?' or 'Total sales yesterday') filtered strictly by your staff permissions.",
    ],
    proTip:
      "The assistant runs entirely on your local store PC with zero external AI subscriptions, zero latency, and complete data privacy.",
    videoPlaceholderText: "Video Walkthrough: Interacting with the in-app assistant for instant reports and guidance",
  },
];
