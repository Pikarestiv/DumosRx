import type { GuideItem } from "./types";

export const STOREFRONT_GUIDES: GuideItem[] = [
  {
    id: "storefront-plans",
    title: "Online Storefront on Pro and Enterprise: What Each Plan Includes",
    category: "Online Storefront",
    badge: "New Feature",
    readTime: "3 min read",
    videoDuration: "2:30",
    summary:
      "Pro gives your shop a public online store with up to 300 products, three styles and payment by transfer, mobile money or on delivery. Enterprise adds every style, your own colours, card payments, services, a language switch and instant publishing.",
    steps: [
      "Ask your account manager to switch your online store on. Your plan alone does not publish it.",
      "On Pro, your account manager picks your style from the styles on your plan and sets your details. On Enterprise, open Settings > Store > Online Storefront and change the look, colours, languages and opening hours yourself.",
      "Choose which products appear online with the Show Online switch on each product, or the bulk Show or hide in online store action on the Products page. Pro lists up to 300 products per store; turn one off to free a slot for another.",
      "Set how customers pay. Pro takes bank transfer or mobile money (add your payment instructions) and pay on delivery. Enterprise can also connect a payout account under Settings > Payment Methods to take card payments online.",
      "Publish your changes. On Pro, your home page (featured products, style, colours, services and languages) updates every night at 03:00 Lagos time. On Enterprise, tap Publish changes now in Settings > Store > Online Storefront. The Shop page, cart prices, stock and checkout are always live on both plans.",
    ],
    proTip:
      "If your Pro store has more than 300 products online when the cap starts, DumosRx keeps your 300 best sellers from the last 90 days listed and tells you in a notification. Nothing leaves your inventory or the till, and upgrading to Enterprise lets you switch the rest back on.",
    videoPlaceholderText: "Video Walkthrough: Setting up a Pro storefront, the 300-product cap, and Enterprise instant publishing",
  },
  {
    id: "starter-online-storefront",
    title: "Your Starter Online Storefront: Put Up to 50 Products Online",
    category: "Online Storefront",
    badge: "New Feature",
    readTime: "3 min read",
    videoDuration: "2:00",
    summary:
      "Starter gives your shop a simple public online store at dumosrx.com/s/your-store: up to 50 products you choose, orders by WhatsApp or the cart, pickup in store or pay on delivery, and the style made for your type of store.",
    steps: [
      "Make sure your store has an online address. If Settings > Store > Online Storefront says it isn't set up yet, contact your account manager and they will reserve one for you.",
      "Open Settings > Store > Online Storefront and tap Turn on my online store, or ask your account manager to switch it on for you. Nothing goes online until one of you does.",
      "If the card says your store isn't switched on yet, ask your account manager to switch it on. Your store page appears after the next nightly update at 03:00 Lagos time.",
      "Choose your products with the Show Online switch on each product, or the bulk Show or hide in online store action on the Products page. Starter lists up to 50 products per store; turn one off to free a slot for another.",
      "Add your WhatsApp number and switch on pay on delivery if you deliver, through your account manager. Customers can order on WhatsApp or check out in the cart and pay when they collect or when you deliver. Online card payment and bank transfer at checkout are part of the Pro and Enterprise plans.",
    ],
    proTip:
      "Put your 50 best sellers online first. The till stops at 50, and if you move down from Pro with more listed, DumosRx keeps your 50 best sellers from the last 90 days on the storefront and keeps the rest in your inventory and on the till. Upgrade to Pro and they go back online automatically.",
    videoPlaceholderText: "Video Walkthrough: Turning on a Starter storefront, picking your 50 products, and taking WhatsApp and pay-on-delivery orders",
  },
];
