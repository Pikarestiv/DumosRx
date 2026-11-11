export interface GuideItem {
  id: string;
  title: string;
  category: "Point of Sale" | "Inventory" | "Multi-Store" | "Device & Security";
  badge?: string;
  readTime: string;
  videoDuration: string;
  summary: string;
  steps: string[];
  proTip?: string;
  videoPlaceholderText: string;
}

export const GUIDES: GuideItem[] = [
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
      "In the POS cart, click 'Source outside' on the item, or simply tap any out-of-stock product tile on the screen.",
      "Enter the buying cost paid to the outside shop (sourcing cost) and your customer selling price to see your instant profit margin.",
      "Choose payment source: select 'Cash Drawer' if cash was taken from the register, or 'Owner Credit / Paid Externally' if paid on credit.",
      "Tap 'Add to Cart' and complete the sale as usual. DumosRx automatically records the cash expense (if paid from drawer) and logs accurate profit without touching shelf batches.",
    ],
    proTip:
      "When paid from the cash drawer, DumosRx automatically logs a 'Stock Sourcing' expense tied to the sale receipt number. At Daily Close, Net Cash Expected automatically subtracts this payout so your physical drawer cash balances with zero manual calculations!",
    videoPlaceholderText: "Video Walkthrough: Ringing up externally sourced items and automatic cash drawer balancing",
  },
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
    id: "branch-transfers",
    title: "Inter-Branch Transfers: Move & Borrow Stock Across Locations",
    category: "Multi-Store",
    badge: "Multi-Branch",
    readTime: "2 min read",
    videoDuration: "2:00",
    summary:
      "Running low at one pharmacy branch while another has excess? Borrow or transfer stock across your locations in seconds, keeping stock balanced without manual phone calls.",
    steps: [
      "Navigate to Inventory > Transfers (or tap 'Transfer Stock' directly from the POS).",
      "Select 'New Transfer', then pick your source branch (sending) and destination branch (receiving).",
      "Search for the products and specify the exact quantities to transfer.",
      "Submit the transfer. Real-time cloud sync immediately updates the stock registers across both branches.",
    ],
    proTip:
      "You have full control over permissions: use Settings > Roles & Permissions to decide which staff members are authorized to request or approve stock transfers.",
    videoPlaceholderText: "Video Walkthrough: Requesting, approving, and syncing stock transfers between branches",
  },
  {
    id: "till-relink",
    title: "Instant Till Re-link: Reconnect Devices Without Traveling or Sharing Passwords",
    category: "Device & Security",
    badge: "New Feature",
    readTime: "1 min read",
    videoDuration: "1:15",
    summary:
      "Re-link disconnected, formatted, or offline till computers in seconds using single-use 15-minute codes, without ever having to share your confidential owner password or master PIN with staff.",
    steps: [
      "Open DumosRx on your phone or owner device and go to Settings > Account > Sessions & Devices.",
      "Tap 'Generate Re-link Code' to view your 8-character single-use code with a 15-minute countdown.",
      "Share the 8 characters with your shop staff over phone or chat. The cashier enters the code directly on the till screen.",
      "The till immediately reconnects and resumes offline-first sync. If you are unreachable, your DumosRx CRM / Support team can generate a code on your behalf from the administrative portal.",
    ],
    proTip:
      "Codes are single-use and expire after 15 minutes. Every code consumption is securely logged in your store activity history with the device identity and timestamp.",
    videoPlaceholderText: "Video Walkthrough: Generating 15-minute till re-link codes and remote support fallback",
  },
];

export function getGuideBySlug(slug: string): GuideItem | undefined {
  return GUIDES.find((g) => g.id === slug);
}

