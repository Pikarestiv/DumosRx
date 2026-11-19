import type { GuideItem } from "./types";

export const PROCUREMENT_GUIDES: GuideItem[] = [
  {
    id: "purchase-order-autosave",
    title: "Purchase Orders Save Themselves: Drafts, Undo and Another Till",
    category: "Inventory",
    badge: "New",
    readTime: "2 min read",
    videoDuration: "1:50",
    summary:
      "A purchase order is saved on this device the moment you add its first item, and every change after that saves on its own. Leave, come back, or pick it up on another till.",
    steps: [
      "Tap 'Create Order' and add an item. The header now reads 'Saved on this device', then 'Saved · synced' once the cloud has it. Tap 'Save now' any time you want to be sure.",
      "Just tap Back when you are done for now. There is no 'discard changes' question any more; the draft stays in the list as a Draft, with how old it is beside it. Only if this device could not save your last change are you asked whether to stay and retry or leave without it.",
      "Tap 'Create Order' again within a day and you are asked whether to continue your last order or start a new one.",
      "Changed a quantity, cost, lot or expiry by mistake? Each changed field shows what it was with a 'revert' link, and Ctrl+Z (or the undo arrow) steps back through this visit's changes.",
      "If another till is editing the same order, you see 'Being edited on Counter 2' and can only look. Tap 'Take over' if that till has walked away. If two tills did change it, you are told and can load their version or keep yours as a new draft; if your till was offline, yours is kept as a 'Recovered copy' for you.",
      "To get rid of a draft, use the three dots in the header and 'Delete draft'. You have a few seconds to undo it.",
    ],
    proTip:
      "A draft that has sat untouched for 30 days is flagged in the list. The only drafts ever removed for you are empty ones: an order whose every item you took out is deleted when you leave it (with Undo), and nothing with an item, a note or a payment is touched.",
    videoPlaceholderText: "Video Walkthrough: Building an order that saves itself and picking it up on another till",
  },
  {
    id: "purchase-order-recovered-copy",
    title: "Recovered Copies: When Two Tills Changed the Same Purchase Order",
    category: "Inventory",
    badge: "New",
    readTime: "1 min read",
    videoDuration: "1:00",
    summary:
      "If your till edited a purchase order while offline and another till changed it first, your version is not thrown away. It is kept as a new draft called 'Recovered copy of PO-…'.",
    steps: [
      "When your till comes back online and its edits to an order lose to another till's, a message names the order and the recovered copy.",
      "The Purchase Orders list shows a notice while any recovered copy is waiting. Tap 'Open the recovered draft' to see exactly what you had typed: vendor, items, quantities, costs, lots and expiry dates.",
      "Compare it with the original order. Keep whichever is right: receive or send the recovered copy and delete the other, or copy the missing lines across and delete the recovered copy.",
      "The recovered copy starts unpaid with nothing received, so no payment or stock is counted twice.",
    ],
    proTip:
      "To avoid the clash in the first place, use 'Take over' on the till you are working on rather than editing the same order on two tills at once.",
    videoPlaceholderText: "Video Walkthrough: Finding and resolving a recovered copy of a purchase order",
  },
  {
    id: "purchase-order-void-receipt",
    title: "Void a Purchase Order Receipt Booked by Mistake",
    category: "Inventory",
    badge: "New",
    readTime: "1 min read",
    videoDuration: "1:10",
    summary:
      "Received the wrong order, or the same delivery twice? Void that receipt to take its stock back out and put the order back to expecting it.",
    steps: [
      "Open the order from Procurement. Under Receipts, each delivery you received is listed with its date, time, lot and units.",
      "Tap 'Void receipt' beside the wrong one. The confirmation says how many units come back out of stock. Confirm to void it.",
      "The order goes back to Partially received, or to Ordered or Draft if nothing else had arrived, so you can receive it again correctly.",
      "A receipt that has already been partly sold, or that paid off units customers were owed, cannot be voided. Correct stock with Adjust Stock instead.",
    ],
    proTip:
      "Voiding needs both the Receive Purchase Orders and Adjust Stock Counts permissions. What you paid the vendor is not changed; update the amount paid on the order if that was wrong too.",
    videoPlaceholderText: "Video Walkthrough: Voiding a receipt and receiving the order again",
  },
  {
    id: "purchase-order-close-short",
    title: "Close a Purchase Order Short When the Vendor Won't Deliver the Rest",
    category: "Inventory",
    badge: "New",
    readTime: "1 min read",
    videoDuration: "0:50",
    summary:
      "When a supplier delivers part of an order and will not send the rest, close it short so it stops showing as open and you only owe for what arrived.",
    steps: [
      "Open a Partially received order from Procurement.",
      "Tap 'Close short' and confirm.",
      "The order is marked Closed short. Its total drops to the value of what actually arrived, and what you still owe is worked out from the amount you have paid.",
      "Nothing more can be received against it. Stock already received is not touched.",
    ],
    proTip:
      "Record payments as an amount paid rather than a status: the order works out on its own whether it is unpaid, part paid or fully paid, even after its total changes.",
    videoPlaceholderText: "Video Walkthrough: Closing a short delivery",
  },
];
