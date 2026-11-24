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
];
