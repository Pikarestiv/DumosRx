import type { GuideItem } from "./types";

export const OPERATIONS_GUIDES: GuideItem[] = [
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
      "Open DumosRx on your phone or owner device and go to Settings > Security > Sessions & Devices.",
      "Tap 'Generate Re-link Code' to view your 8-character single-use code with a 15-minute countdown.",
      "Share the 8 characters with your shop staff over phone or chat. The cashier enters the code directly on the till screen.",
      "The till immediately reconnects and resumes offline-first sync. If you are unreachable, your DumosRx CRM / Support team can generate a code on your behalf from the administrative portal.",
    ],
    proTip:
      "Codes are single-use and expire after 15 minutes. Every code consumption is securely logged in your store activity history with the device identity and timestamp.",
    videoPlaceholderText: "Video Walkthrough: Generating 15-minute till re-link codes and remote support fallback",
  },
  {
    id: "staff-permissions",
    title: "Staff Accounts, Roles & Cashier PINs: Control Access & Safe Account Archiving",
    category: "Device & Security",
    badge: "Team Security",
    readTime: "2 min read",
    videoDuration: "2:05",
    summary:
      "Create individual cashier logins with unique 4-digit PINs, fine-tune granular permission groups, and safely archive departing employees with 1-click restore.",
    steps: [
      "Open Settings > Staff and tap 'Add Staff'.",
      "Enter the employee's name, assign their role/permission group, and set their 4-digit login PIN.",
      "When cashiers arrive at work, they simply tap their profile or enter their PIN at the till lock screen.",
      "If a staff member departs, click 'Delete' to archive their login. Old sales and receipts remain 100% intact, and their account can be restored from the 'Deleted Accounts' tab at any time.",
    ],
    proTip:
      "Individual cashier PINs ensure that every void, refund, or discount is permanently attributed to the exact staff member who authorized it.",
    videoPlaceholderText: "Video Walkthrough: Managing staff rosters, assigning PINs, and recovering archived accounts",
  },
  {
    id: "online-storefront",
    title: "Online Webstore & Digital Prescriptions: Sell Online & Fulfill from Branches",
    category: "Online Storefront",
    badge: "E-Commerce",
    readTime: "2 min read",
    videoDuration: "2:20",
    summary:
      "Launch a professional customer-facing webstore under your brand. Customers can browse catalog items, order online for pickup/delivery, and upload doctor prescriptions securely.",
    steps: [
      "Products in your catalog automatically list online unless 'Show Online' is turned off.",
      "Share your branded storefront URL (e.g. dumosrx.com/store/your-pharmacy) with customers on WhatsApp and social media.",
      "Customers can switch between branches, search available medicines, and complete purchases via Paystack.",
      "Patients can securely upload prescription images or PDFs at your storefront `/prescription` page, alerting your pharmacists for instant verification.",
    ],
    proTip:
      "Online orders appear in real time on the store's POS screen, allowing staff to prepare items for customer pickup or dispatch.",
    videoPlaceholderText: "Video Walkthrough: Setting up your webstore, managing online orders, and processing digital prescriptions",
  },
];

