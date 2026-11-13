import type { GuideItem } from "./types";

export const INVENTORY_GUIDES: GuideItem[] = [
  {
    id: "sell-at-zero-stock",
    title: "Sell Beyond Recorded Stock: Incoming Deliveries & Delayed Paperwork",
    category: "Inventory",
    badge: "Inventory Pro",
    readTime: "3 min read",
    videoDuration: "2:15",
    summary:
      "Sell newly arrived stock immediately while cartons are still unloading on your shop floor, without waiting for staff to finish entering supplier invoices or purchase orders.",
    steps: [
      "Go to Settings > Register Configs (or Store Settings) and toggle on 'Allow sales beyond recorded stock'.",
      "Cashiers can now ring up products even when on-screen stock shows zero. A subtle notice reminds staff that units are recorded as owed.",
      "When the delivery is subsequently entered via a Purchase Order or Immediate Purchase, the system automatically clears the owed units first and places the remainder on the shelf.",
      "Past sales lines are automatically re-costed from the true invoice delivery cost, ensuring your reported profits reflect reality.",
    ],
    proTip:
      "If you run a stock count while units are owed, DumosRx warns you to receive the delivery paperwork first, preventing accidental double-counting.",
    videoPlaceholderText: "Video Walkthrough: Selling past stock, backorder tracking, and automatic invoice reconciliation",
  },
  {
    id: "cycle-count",
    title: "Cycle Count & Stock Audit: Walk Shelves, Auto-Save Drafts & Cloud Fencing",
    category: "Inventory",
    badge: "Audit Tool",
    readTime: "3 min read",
    videoDuration: "2:30",
    summary:
      "Audit your pharmacy shelves section by section. Counted quantities start clean, in-progress audits are saved on the device as you count and survive logout, switching user and restarts, and cloud session locking prevents multi-till count collisions.",
    steps: [
      "Navigate to Inventory > Audits and tap 'Start Audit'.",
      "Walk the shelves and enter your physical counts row by row. Where a quantity matches system records, tap the checkmark to confirm.",
      "Filter the sheet by 'Counted', 'Not Counted', or 'Qty Differences' to review variances.",
      "Need to stop part-way? Logging out, switching account or closing the app keeps the count on this device, and you are reminded first. Sign back in on the same device to carry on; while the till was online, another till can also take the count over.",
      "Tap 'Review & Submit' to finalize. Only the rows you actually modified are posted to your inventory ledger.",
    ],
    proTip:
      "If your counting device battery dies, another till can safely take over the cloud audit session without losing a single counted entry.",
    videoPlaceholderText: "Video Walkthrough: Conducting cycle counts, reviewing variance reports, and submitting audits",
  },
  {
    id: "stock-adjustments",
    title: "Stock Adjustments: Log Wastage, Breakage, and Damaged Goods",
    category: "Inventory",
    badge: "Stock Control",
    readTime: "2 min read",
    videoDuration: "1:40",
    summary:
      "Accurately write off damaged, broken, or expired stock with clear audit reasons, keeping inventory numbers matching physical shelf reality.",
    steps: [
      "Open Inventory > Adjustments and tap 'New Adjustment'.",
      "Search for the product and select the specific batch number affected.",
      "Enter the quantity to write off and select a reason (e.g. Broken, Expired, Damaged in Transit, Theft).",
      "Submit the adjustment. System logs an adjustment movement and recalculates running valuation.",
    ],
    proTip:
      "In-progress adjustments auto-save into local draft storage, so switching branches or answering a customer never loses your entries.",
    videoPlaceholderText: "Video Walkthrough: Creating stock adjustments and categorizing shrinkage write-offs",
  },
  {
    id: "procurement-orders",
    title: "Supplier Procurement: Standard Purchase Orders & Immediate Purchases",
    category: "Inventory",
    badge: "Purchasing",
    readTime: "2 min read",
    videoDuration: "2:10",
    summary:
      "Manage supplier relationships, issue formal purchase orders ahead of delivery, or log Immediate Purchases when goods are paid and received on the spot.",
    steps: [
      "Navigate to Procurement and tap 'New Purchase Order'.",
      "Select your supplier, expected delivery date, and add line items with agreed cost prices.",
      "For goods bought and paid on the spot, choose 'Immediate Purchase' to auto-receive inventory and mark payment status as fully paid.",
      "For pending supplier orders, tap 'Receive PO' once the delivery truck arrives to update shelf stock and verify invoice quantities.",
    ],
    proTip:
      "DumosRx tracks your last-paid price right alongside the product's running average cost, so you always know when a supplier raises prices.",
    videoPlaceholderText: "Video Walkthrough: Creating supplier purchase orders and receiving inventory deliveries",
  },
  {
    id: "batch-expiry",
    title: "Batch & Expiry Tracking: FEFO Picking & Near-Expiry Alerts",
    category: "Inventory",
    badge: "Safety Standard",
    readTime: "2 min read",
    videoDuration: "1:50",
    summary:
      "Never lose money to expired stock. DumosRx tracks individual batch numbers and expiration dates, automatically enforcing First-Expired, First-Out (FEFO) dispensing.",
    steps: [
      "Enter batch numbers and expiry dates whenever receiving supplier deliveries or adding stock.",
      "At checkout, the system automatically pulls from the earliest expiring batch on hand.",
      "Check the Expiry Watchlist under Inventory > Expiry to view products expiring within 30, 60, or 90 days.",
      "Print or export near-expiry lists to run clearance promotions before stock reaches its expiration date.",
    ],
    proTip:
      "The system prevents cashiers from dispensing expired batches to customers, protecting patient safety and pharmacy compliance.",
    videoPlaceholderText: "Video Walkthrough: Monitoring expiring batches and automated FEFO inventory picking",
  },
  {
    id: "hide-stock-numbers",
    title: "Hide Stock Quantities: Restrict Counts While Preserving Availability Signals",
    category: "Inventory",
    badge: "Internal Security",
    readTime: "2 min read",
    videoDuration: "1:35",
    summary:
      "Prevent staff stock theft and pilferage by hiding exact on-hand numbers while still showing 'In stock', 'Low stock', and 'Out of stock' signals.",
    steps: [
      "Open Settings > Roles & Permissions and select a staff role (e.g. Sales Cashier).",
      "Uncheck the 'View Stock Quantities' permission and save changes.",
      "Staff members in that group will now see availability badges without the exact numerical count across POS, catalog, and search.",
      "Staff with count, receiving, or management permissions continue to see full counts as required for their duties.",
    ],
    proTip:
      "Hiding quantities from front-desk staff eliminates inventory probing while still letting cashiers know whether an item can be sold.",
    videoPlaceholderText: "Video Walkthrough: Configuring role-based stock quantity visibility for cashiers",
  },
  {
    id: "barcode-labels",
    title: "Barcode Labels: Print on a Label Roll or Pack an A4 Sticker Sheet",
    category: "Inventory",
    badge: "Labelling",
    readTime: "2 min read",
    videoDuration: "1:45",
    summary:
      "Print price and barcode stickers for any product, one per label on a 50 x 25 mm roll, or 24 to a page on standard A4 sticker sheets without wasting a sheet you have already started.",
    steps: [
      "Open Inventory > Catalog, right-click a product and choose 'Print barcode label' (or open the product and choose 'Print Labels' from its actions menu).",
      "Type how many labels you need, or tap a preset (1, 10, 24, 48).",
      "Under Paper, pick 'Label roll' for a thermal label printer, or 'A4 sheet' for 3 x 8 sticker sheets (63.5 x 33.9 mm labels). The dialog shows how many sheets the job will use.",
      "Using a partly used A4 sheet? Set 'Start at position' to the first unused sticker, counted across then down from the top left.",
      "Tap Print, and in the print window keep the scale at 100% with 'Fit to page' turned off so the labels line up with the stickers.",
    ],
    proTip:
      "Your paper choice is remembered on each device, so the counter's label printer and the back office's A4 printer each open on the right layout. If the dialog warns that a barcode is too long to scan, give the product a shorter barcode.",
    videoPlaceholderText: "Video Walkthrough: Printing barcode labels on a label roll and on A4 sticker sheets",
  },
  {
    id: "correct-batch-cost-price",
    title: "Correct a Batch's Cost Price: Fix a Cost Typed Wrongly at Receiving",
    category: "Inventory",
    badge: "Stock Control",
    readTime: "2 min read",
    videoDuration: "1:30",
    summary:
      "Fix the cost price of a batch you have already received, so stock value and future profit use the right figure, while past sales keep the cost they were sold at.",
    steps: [
      "Open Inventory > Catalog, select the product, and open its Batches tab.",
      "Tap the pencil icon beside the batch whose cost is wrong.",
      "Enter the correct cost per unit and tap 'Review change'.",
      "Check the summary of what changes, then tap 'Confirm change'. The correction syncs to your other tills and is recorded in the Activity Log and the product's History tab.",
    ],
    proTip:
      "Only staff with both 'View Cost & Margin Fields' and 'Edit Product Cost Price' see the pencil. Make sure other tills have synced before you edit, so two people do not correct the same batch at once.",
    videoPlaceholderText: "Video Walkthrough: Correcting a batch cost price from the product's Batches tab",
  },
];
