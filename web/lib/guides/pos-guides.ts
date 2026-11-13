import type { GuideItem } from "./types";

export const POS_GUIDES: GuideItem[] = [
  {
    id: "spot-sourcing",
    title: "POS Spot Sourcing: Sell Items Sourced from Outside or Neighbor Stores",
    category: "Point of Sale",
    badge: "New Feature",
    readTime: "2 min read",
    videoDuration: "1:45",
    summary:
      "Never turn away a customer when an item is out of stock. Pick it up from a nearby shop or partner pharmacy and ring it up on the spot. DumosRx tracks your true profit margin and automatically reconciles your till cash drawer at Daily Close.",
    steps: [
      "Tap any out-of-stock product tile, or click 'Source outside' on a cart line. The cart shows it only when the line is out of stock, short, or already holds all your shelf stock.",
      "Enter the buying cost paid to the outside shop (sourcing cost) and your customer selling price to see your instant profit margin.",
      "Choose payment source: select 'Cash Drawer' if cash was taken from the register, or 'Owner Credit / Paid Externally' if paid on credit.",
      "Tap 'Add to Cart' and complete the sale as usual. DumosRx records the sourcing cost as the line's cost of goods and logs accurate profit without touching shelf batches.",
    ],
    proTip:
      "When paid from the cash drawer, Daily Close subtracts the sourcing payout from Net Cash Expected, so your physical drawer cash balances with zero manual calculations. It is not booked as an operating expense, so your profit is not counted twice.",
    videoPlaceholderText: "Video Walkthrough: Ringing up externally sourced items and automatic cash drawer balancing",
  },
  {
    id: "split-payments",
    title: "Split Payments: Mix Cash, Card, and Bank Transfers on One Sale",
    category: "Point of Sale",
    badge: "Cashier Essential",
    readTime: "2 min read",
    videoDuration: "1:30",
    summary:
      "Accept multiple payment methods on a single receipt (such as part cash and part transfer) with automatic exact change calculations.",
    steps: [
      "Rings up the customer's items in the POS and tap the 'Charge' button.",
      "Select 'Mixed Payment' from the payment options.",
      "Enter the amount paid via each method (e.g., ₦5,000 Cash and ₦10,000 Bank Transfer).",
      "Confirm the split. The receipt prints with each split clearly itemized, and cash register balances update accordingly.",
    ],
    proTip:
      "If a customer pays more than the cash portion, DumosRx instantly calculates change due on the cash split without affecting the electronic payments.",
    videoPlaceholderText: "Video Walkthrough: Accepting split payments and calculating change accurately",
  },
  {
    id: "proforma-quotes",
    title: "Proforma Quotes: Generate Price Estimates Without Ringing Up Sales",
    category: "Point of Sale",
    badge: "Sales Tool",
    readTime: "2 min read",
    videoDuration: "1:20",
    summary:
      "Give customers an itemized price quotation for their prescription or shopping list before they commit, without deducting inventory or recording sales revenue.",
    steps: [
      "Add the requested products to the POS cart as normal.",
      "Tap the 'Quote' (Proforma) button in the cart options.",
      "Optionally select or enter the customer's name and contact information.",
      "Print or export the Proforma Quote. When the customer returns to buy, recall the quote and convert it to a live sale with a single click.",
    ],
    proTip:
      "Proforma quotes never deduct physical shelf stock until they are officially converted into completed sales.",
    videoPlaceholderText: "Video Walkthrough: Generating, printing, and converting proforma quotes into sales",
  },
  {
    id: "reseller-markups",
    title: "Reseller Sales & Markups: Track Third-Party Commissions & Extra Margins",
    category: "Point of Sale",
    badge: "Margin Booster",
    readTime: "2 min read",
    videoDuration: "2:00",
    summary:
      "Sell above or below normal list price. Mark up items for independent resellers with automated commission tracking, or retain store markups directly into your business revenue.",
    steps: [
      "Enable 'Allow Price Overrides & Reseller Markups' in Settings > Register Configs.",
      "In the POS cart, tap 'Reseller / Store Markup' on the cart options.",
      "Choose whether this is for an independent reseller (with automated commission payout calculation) or store-retained markup.",
      "Enter the marked-up price. Sales receipts print normal prices while internal logs track commissions and list price differences.",
    ],
    proTip:
      "If a customer returns goods from a reseller sale, DumosRx automatically recalculates unpaid commission to match what was actually retained.",
    videoPlaceholderText: "Video Walkthrough: Applying reseller commissions and store markups at the counter",
  },
  {
    id: "customer-loyalty",
    title: "Customer Loyalty Program: Reward Points & Redemption at Checkout",
    category: "Point of Sale",
    badge: "Customer Retention",
    readTime: "2 min read",
    videoDuration: "1:40",
    summary:
      "Turn one-time shoppers into repeat buyers with automated customer loyalty points earned on every purchase and redeemable for discounts.",
    steps: [
      "Configure your points earning rate in Settings > Loyalty (e.g. 1 point for every ₦1,000 spent).",
      "Attach a customer to the POS cart by searching their phone number or name.",
      "Points are automatically calculated and awarded when the sale is completed.",
      "When a returning customer has enough points, select their available reward tier in the cart to apply an instant discount.",
    ],
    proTip:
      "Loyalty discounts apply transparently to the sale total and are safely recorded in the customer's purchase history for full auditability.",
    videoPlaceholderText: "Video Walkthrough: Enrolling customers, accumulating points, and redeeming rewards at checkout",
  },
  {
    id: "credit-sales",
    title: "Customer Debt Ledger: Manage Credit Sales & Track Repayments",
    category: "Point of Sale",
    badge: "Financial Control",
    readTime: "2 min read",
    videoDuration: "1:50",
    summary:
      "Allow trusted customers to purchase on credit while automatically tracking outstanding balances, debt ceilings, and payment logging.",
    steps: [
      "Select a registered customer in the POS cart.",
      "At checkout, choose 'Credit' or select 'Credit' as part of a mixed payment.",
      "Confirm the sale. The invoice prints with the outstanding balance clearly stated.",
      "When the customer makes a repayment, open Customers > Debt Ledger, click 'Record Repayment', and enter the cash or transfer amount.",
    ],
    proTip:
      "Set customer credit limits under their profile to prevent staff from overextending credit beyond approved store policies.",
    videoPlaceholderText: "Video Walkthrough: Selling on credit and logging customer repayments in the debt ledger",
  },
  {
    id: "hold-cart",
    title: "Park & Hold Transactions: Serve the Next Customer Without Losing Carts",
    category: "Point of Sale",
    badge: "Queue Buster",
    readTime: "1 min read",
    videoDuration: "1:15",
    summary:
      "Keep customer lines moving. If a buyer steps away to grab an additional medicine, park their cart on hold and serve the next person in line.",
    steps: [
      "When a customer needs to pause checkout, tap the 'Hold' button in the POS cart.",
      "The cart clears immediately, allowing you to ring up the next customer.",
      "When the first customer returns, tap the 'Held Sales' icon in the header.",
      "Tap 'Resume' on their parked cart to restore all items and customer details instantly.",
    ],
    proTip:
      "Held carts are stored safely in local SQLite on the till and persist even if the computer is restarted or switched off.",
    videoPlaceholderText: "Video Walkthrough: Holding, recalling, and managing multiple parked sales during peak hours",
  },
  {
    id: "custom-receipts",
    title: "Custom Receipts & A4 Invoices: Tailor Branding, Paper Sizes & Tax Details",
    category: "Point of Sale",
    badge: "Store Branding",
    readTime: "2 min read",
    videoDuration: "1:45",
    summary:
      "Customize thermal receipts with your pharmacy logo, header address, and custom footer slogans. Switch to full-width A4 Tax Invoices for corporate clients.",
    steps: [
      "Go to Settings > Receipt Settings to upload your store logo and set header/footer texts.",
      "Choose your layout: Logo above or beside store name, thermal 80mm roll, 58mm roll, or full-width A4 page format.",
      "Toggle on 'Include Tax/VAT Number' to generate formal Tax Invoices for institutional buyers.",
      "Print test receipts directly to your USB, Bluetooth, or network receipt printer.",
    ],
    proTip:
      "Paper format is remembered per device, so the sales counter can use thermal till rolls while the back-office PC prints formal A4 invoices.",
    videoPlaceholderText: "Video Walkthrough: Configuring receipt headers, logos, tax numbers, and A4 invoice formats",
  },
  {
    id: "customer-returns-disposition",
    title: "Customer Returns & Refunds: Restock vs Damaged Goods Disposition",
    category: "Point of Sale",
    badge: "Pharmacy Essential",
    readTime: "2 min read",
    videoDuration: "1:40",
    summary:
      "Handle partial or full customer returns with granular disposition control. Return sound products back to inventory while writing off broken, unsealed, or compromised medicines as damage loss in a single transaction.",
    steps: [
      "Find the transaction in Sales History and tap 'Return / Refund'.",
      "Select the items being returned and set the 'Qty to Return' (the customer receives a full refund for all returned units).",
      "If any units are broken, expired, or unsealed, enter the count under 'Damaged / Discard' and pick the reason.",
      "Review the breakdown: sound units return to stock batches, while damaged units are written off directly as inventory loss without touching shelf stock.",
      "Confirm to process the refund and update inventory and accounting automatically.",
    ],
    proTip:
      "Discarded medicines never re-enter saleable stock batches, protecting pharmacy safety standards while automatically logging an inventory write-off in your Profit & Loss reports.",
    videoPlaceholderText: "Video Walkthrough: Processing split customer returns with damaged medicine write-offs",
  },
  {
    id: "service-sales",
    title: "Service POS: Selling Walk-In Services Alongside Physical Products",
    category: "Point of Sale",
    badge: "New Feature",
    readTime: "2 min read",
    videoDuration: "1:35",
    summary:
      "Offer spa treatments, salon styling, consultations, clinical checks, or repair services alongside physical items in a unified POS cart without creating phantom inventory batches.",
    steps: [
      "In the POS screen, tap the 'Services' tab above the product list.",
      "Browse or search for the service (e.g., Full Body Massage, Consultation, Hair Styling).",
      "Tap 'Add to Cart' to include the service line item alongside any retail products the customer is purchasing.",
      "Adjust quantities as needed. Services never track shelf stock or block checkout on zero inventory.",
      "Complete payment with any supported tender (Cash, Card, Transfer, Split). Receipts print with services clearly designated, and sales revenue is recorded cleanly.",
    ],
    proTip:
      "Because services are tracked separately from physical goods, your inventory reports and cycle counts remain 100% accurate without phantom batch variances or artificial reorder alerts.",
    videoPlaceholderText: "Video Walkthrough: Ringing up mixed carts with physical products and service sales",
  },
];

