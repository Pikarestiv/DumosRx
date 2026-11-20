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
      "When the delivery is later received on a purchase order, the system automatically clears the owed units first and places the remainder on the shelf.",
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
      "Wait a moment while the till syncs the latest stock from the cloud. Offline, you can still count; the screen tells you counts are measured against the till's last sync. If the sync fails while online, tap Retry, or 'Count anyway' only if you accept that sales on other tills may be missing.",
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
    title: "Supplier Procurement: Purchase Orders, Counter Purchases and Drafts",
    category: "Inventory",
    badge: "Purchasing",
    readTime: "2 min read",
    videoDuration: "2:10",
    summary:
      "Order from a supplier ahead of delivery, or record goods bought and received on the spot, from one screen. Save a draft at any point and finish it later.",
    steps: [
      "Navigate to Procurement and tap 'Create Order'. You land straight on the item list: search and add products, with the quantity, cost, lot and expiry for each.",
      "Tap the pencil on the Vendor bar to choose the supplier, the amount paid, due date and notes. Type what you have paid, or tap 'Paid in full'; the order works out whether it is unpaid, part paid or fully paid. A walk-in purchase starts as paid in full, and the due date only shows while money is still owed.",
      "Each line shows the product's selling price, which the order never changes. Tap its pencil to edit the product's name or price. An amber note warns when the cost is at or above the selling price, or higher than you paid last time.",
      "The order saves itself as a draft from the first item. For a walk-in purchase, tap 'Receive stock'. For a supplier, tap 'Send to vendor' to mark it Ordered and share its PDF, or 'Receive stock' if the goods are already in front of you. A draft can keep a row at 0 until you have counted it, and 'Download PDF' works on drafts too.",
      "Receiving always shows a summary first: how many units and how much, that no selling price will change, and any margin warnings.",
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
      "Labelling many products at once? On the desktop Catalog, narrow the list with search or the Category and Inventory filters, tap 'Print labels' beside the search box, and print one label per product shown packed across the sheet (set 'Labels per product' for more).",
    ],
    proTip:
      "Your paper choice is remembered on each device, so the counter's label printer and the back office's A4 printer each open on the right layout. If the dialog warns that a barcode is too long to scan, give the product a shorter barcode.",
    videoPlaceholderText: "Video Walkthrough: Printing barcode labels on a label roll and on A4 sticker sheets",
  },
  {
    id: "correct-batch-cost-price",
    title: "Correct a Batch: Fix a Cost, Expiry Date, Lot Number or Manufacture Date",
    category: "Inventory",
    badge: "Stock Control",
    readTime: "2 min read",
    videoDuration: "1:30",
    summary:
      "Fix a batch you have already received: its cost price, expiry date, lot number or manufacture date, in one form. Stock value, profit and expiry alerts use the corrected figures, while past sales keep the cost they were sold at.",
    steps: [
      "Open Inventory > Catalog, select the product, and open its Batches tab.",
      "Tap the pencil beside the batch that is wrong. (To set an expiry, you can also tap 'Add' or 'Edit' beside Next expiry on the Details tab.)",
      "Change what is wrong: the cost per unit, the lot number, the expiry date or the manufacture date. Type a date as DD/MM/YYYY or pick it from the calendar; clear it to remove it. The manufacture date cannot be after the expiry date.",
      "If you change the cost, the box below shows what changes as you type: the average cost, the stock value, the margin and the profit per unit at your selling price. Pick a reason (Typo at receiving, Supplier invoice corrected, Other).",
      "Tap 'Save changes'. The correction syncs to your other tills and is recorded, with who made it, in the Activity Log and the product's History tab.",
    ],
    proTip:
      "Only staff with 'Edit Batch Details' see the pencil, and they need 'View Cost & Margin Fields' to see and change costs; without it they can still fix a batch's expiry, lot and manufacture date. You can reach the same form straight from the catalog list too: see the 'See and Fix What a Product Costs' guide.",
    videoPlaceholderText: "Video Walkthrough: Correcting a batch's cost, expiry date and lot number from the product's Batches tab",
  },
  {
    id: "cost-breakdown",
    title: "See and Fix What a Product Costs: The Cost Breakdown in the Catalog",
    category: "Inventory",
    badge: "New",
    readTime: "3 min read",
    videoDuration: "2:00",
    summary:
      "Click a product's cost in the catalog to see every batch behind it: when it arrived, which order it came from, its lot, expiry, units left and cost, and which batch sells first. Correct a wrong cost right there. Each sale is costed at the batch it sells from, so this is what your profit is built on.",
    steps: [
      "Open Inventory > Catalog on a computer or tablet and click the cost figure (the one with the small arrow) on any product row, or open a product and tap 'From N batches' under Avg cost on its Details tab.",
      "Read the batches: received date and time, 'From PO-...' when it came in on a purchase order, lot, expiry and units left. The batch marked 'Sells first' is the one the next sale takes stock from (earliest expiry first).",
      "The line at the bottom explains the average, for example 'Average 670 = (13 x 650 + 2 x 800) / 15 units', and shows the last cost you received the product at.",
      "Sold-out batches are hidden; tap 'Show sold-out batches' to see them. They can still be corrected, because the last cost you paid comes from them.",
      "To correct a batch, tap the pencil beside it. One form holds the cost, lot number, expiry date and manufacture date: change what is wrong (a cost change shows 'After this correction' and asks for a reason), then tap 'Save changes'. Read any warning first: a cost of 0, a cost far from your other batches (an extra zero), or an older batch that will sell before this one.",
      "Profit looks wrong at your selling price? Close the breakdown and tap 'Change selling price' on the product's Details tab.",
    ],
    proTip:
      "Correcting a cost never changes sales you have already made: their profit stays as it was recorded. It also leaves the purchase order and what you paid the supplier untouched. Staff without 'Edit Batch Details' see the breakdown but cannot change it, and staff without 'View Cost & Margin Fields' do not see costs at all (they can still fix a batch's expiry, lot and manufacture date).",
    videoPlaceholderText: "Video Walkthrough: Reading a product's cost breakdown and correcting a batch cost from the catalog",
  },
  {
    id: "product-details-panel",
    title: "The Product Details Panel: Stock, Price, Margin and Expiry at a Glance",
    category: "Inventory",
    badge: "New",
    readTime: "2 min read",
    videoDuration: "1:30",
    summary:
      "Open a product in the Catalog to see how much is in stock, what it sells for, what it costs you and what you make on each unit, all on one screen, with the next things to do one tap away.",
    steps: [
      "Open Inventory > Catalog and select a product. The top row has Edit, Adjust stock and Add to order. 'Add to order' opens a new purchase order with this product already on its first line.",
      "The four cards show In stock (with your reorder level), Selling price, Avg cost and Margin. Tap 'From N batches' under Avg cost to see exactly how that average is worked out.",
      "Under Pricing, compare your profit and margin on the average cost of stock on the shelf with what restocking costs now (the last cost you received). Tap 'Change selling price' to edit the selling price.",
      "Under Stock & expiry, see the next expiry date and when the product was last counted. Tap 'Add' or 'Edit' beside Next expiry to set a batch's expiry date, or 'Count now' to count the product.",
      "Switch to Batches for every batch on hand, or Movements for the history: who changed what, with the date and time.",
    ],
    proTip:
      "Margin here is worked out on the average cost, while 'Last cost' shows what restocking costs today. If the last cost margin is much lower, it is time to raise the price. Staff without permission to view cost fields do not see the cost, margin or pricing figures.",
    videoPlaceholderText: "Video Walkthrough: Reading the product details panel and acting from it",
  },
  {
    id: "product-images",
    title: "Product Images: Add a Photo to Every Product",
    category: "Inventory",
    badge: "New",
    readTime: "2 min read",
    videoDuration: "1:30",
    summary:
      "Give each product one photo. It shows in your catalog, on the POS product tiles so cashiers find items faster, and on your online store's product cards.",
    steps: [
      "Open Inventory > Catalog and select the product.",
      "In the Image section at the bottom of the Details tab, tap 'Upload image' and pick a photo, or take one with your phone or tablet camera.",
      "The photo is shrunk on your device before it uploads, so even a large camera photo uploads quickly. You need an internet connection; offline, the buttons are disabled and the rest of the product still saves as normal.",
      "Use 'Replace image' to change the photo, or 'Remove image' to go back to the category icon. Every till picks up the change on its next sync, and your online store on its next refresh.",
      "On a slower till, turn off 'Show product images in POS grid' in Settings > Register Configs. The POS then shows the category icon instead.",
    ],
    proTip:
      "Photograph the product on a plain, light background, straight on and filling the frame. The whole photo is shown without cropping, and tapping it on the POS tile or in the catalog opens a larger view.",
    videoPlaceholderText: "Video Walkthrough: Adding, replacing and removing a product photo",
  },
  {
    id: "add-products-faster",
    title: "Add Products Faster: A Shorter Form, Quick Edits and One Actions Menu",
    category: "Inventory",
    badge: "New",
    readTime: "2 min read",
    videoDuration: "1:45",
    summary:
      "Stock a whole shelf quickly. The Add Product form asks only for what you need, remembers the category you just used, and every field explains itself on hover. In the catalog, one pencil edits a product and one Product actions menu holds printing, import, export and category tools.",
    steps: [
      "Open Inventory > Catalog and tap 'Add Product'. The form shows name, category, selling price, reorder level and barcode. Put the size or strength in the name if that is how you spot products at a glance.",
      "Hover a field's question-mark icon (or tap it on a phone) for a plain explanation of what the field is for.",
      "Need strength, dosage form, generic name, manufacturer or registration number? Open 'Additional Details'. It stays open or closed the way you last left it.",
      "Adding many products to one shelf? Use 'Save & Add Another': the category stays filled in. Opening the form fresh pins your last used category at the top of the category list.",
      "To change a product, hover its row in the catalog, or a line on a purchase order, and tap the pencil after the name (always visible on phones and tablets). The edit form opens straight away, in the same form you add products with.",
      "On desktop, the 'Product actions' menu above the catalog holds Print barcode labels, Import products from a file, Export product list, Show or hide in online store, and Manage categories.",
    ],
    proTip:
      "Scanning a barcode now starts the camera straight away once you have allowed it once, so scanning products into the form takes a moment instead of a pause.",
    videoPlaceholderText: "Video Walkthrough: Adding a shelf of products, quick-editing from the catalog and using the Product actions menu",
  },
  {
    id: "purchase-order-panel",
    title: "Purchase Order Panel: Send, Receive in Parts and Track Delivery",
    category: "Inventory",
    badge: "New",
    readTime: "2 min read",
    videoDuration: "1:40",
    summary:
      "Open any purchase order to see its status, what has arrived and what to do next. Everything that is not a next step sits in a More actions menu.",
    steps: [
      "Open Procurement and tap an order. The header shows the order number, supplier, date and status, with a stepper below the items: Draft, Ordered, Received.",
      "A draft has 'Edit', 'Download PDF' and 'Receive stock'. If it is for a supplier it also has 'Send to vendor', which marks it Ordered and opens your phone's share sheet with the PDF (or downloads it). Receive stock shows a summary first, and lines still at 0 are left off the receipt.",
      "When the order is Ordered, tap 'Receive Items' as the delivery arrives. A line saved at 0 takes whatever quantity actually arrived. If only part of it comes, receive what you have; the order becomes Partially received and each line shows 'Received 250 of 400' with a progress bar.",
      "Tap 'Receive Remaining' when the rest arrives, or 'Close short' if the vendor will not deliver it. Once every line is in, the order is locked and the panel says so.",
      "Tap the three dots (More actions) for Download PDF, Delete order and, on an Ordered order, Edit order. Partially received and received orders cannot be edited or deleted.",
    ],
    proTip:
      "Receive a delivery as soon as it is on your shelf, even if it is only part of the order. The progress bars then double as your list of what the supplier still owes you.",
    videoPlaceholderText: "Video Walkthrough: Sending an order, receiving a partial delivery and finishing it",
  },
  {
    id: "duplicate-products",
    title: "Duplicate Product Warnings: Same Name, Different Size",
    category: "Inventory",
    badge: "New",
    readTime: "1 min read",
    videoDuration: "1:00",
    summary:
      "DumosRx warns you when you add a product that already exists, so your POS grid and stock counts do not end up with two identical rows. Genuine variants are still allowed.",
    steps: [
      "Add a product whose name matches one already in your catalog. A note under the name tells you it already exists and which category it is in.",
      "If it is really a different product, put the size or strength in the name, or fill in 'Strength / Size' under Additional Details. The warning disappears once the two differ, for example 200ml and 500ml.",
      "If it is the same product, close the form and edit the existing one instead, from the pencil beside its name in the catalog.",
      "A barcode can only belong to one product. Typing or scanning a barcode that is already in use stops the save and tells you which product has it.",
      "To clean up products that are already duplicated, open the Inventory filter in the catalog and choose 'Possible Duplicates'. It lists every product that shares a name and size, or a barcode, with another.",
    ],
    proTip:
      "The check runs against the products on the till you are using. If two tills add the same product while offline, the duplicate only shows up after they sync, so rename or merge it then.",
    videoPlaceholderText: "Video Walkthrough: Spotting a duplicate and telling two sizes apart",
  },
  {
    id: "service-categories",
    title: "Service Categories: Pick, Rename and Tidy Up in One Place",
    category: "Inventory",
    badge: "New",
    readTime: "1 min read",
    videoDuration: "1:00",
    summary:
      "Pick a service's category from the ones you already use instead of retyping it, so 'Consultation' and 'consultation' never become two categories. Rename or remove a category for all its services at once.",
    steps: [
      "Open Inventory, then Services, and tap Add Service (or the pencil on an existing one).",
      "Click the Category box. Your existing categories are listed; pick one, or type a new name and choose 'Create' to add it.",
      "If you type a name that only differs by capital letters from an existing category, DumosRx uses the existing one.",
      "To tidy up, open 'Services actions' beside the search box and choose 'Manage categories'. In Settings, on the Services tab, use the pencil to rename a category on every service that uses it, or the bin to remove it. Removed categories leave those services as Uncategorized.",
      "The same 'Services actions' menu has 'Export services list' to download the services you are looking at as CSV, Excel or PDF.",
    ],
    proTip:
      "Rename a category once here instead of editing services one by one. The new name shows on the POS service tiles and the services list straight away.",
    videoPlaceholderText: "Video Walkthrough: Choosing, renaming and removing service categories",
  },
  {
    id: "product-icons",
    title: "Product Icons: A Fitting Picture for Every Product Without a Photo",
    category: "Inventory",
    badge: "New",
    readTime: "1 min read",
    videoDuration: "1:00",
    summary:
      "Products without a photo get an icon chosen from the product's category and its name, so a perfume looks like a perfume and a malaria tablet looks like medicine, on the POS and on your online store.",
    steps: [
      "Give each product a clear category and put the product type in the name (for example 'Cussons Baby Lotion 200ml').",
      "On the POS grid and in the catalog, a product with no photo shows an icon matched to its category, and refined by words in its name.",
      "Your online store shows the same kind of icon on product cards that have no photo.",
      "To replace an icon with a real picture, open the product in the catalog and upload an image. Remove the image to go back to the icon.",
    ],
    proTip:
      "If an icon looks wrong, the category is usually the cause. Moving the product into a better-named category fixes its icon everywhere.",
    videoPlaceholderText: "Video Walkthrough: How categories and names pick a product's icon",
  },
];
