export type GuideCategory =
  | "Point of Sale"
  | "Inventory"
  | "Reports & Finance"
  | "Multi-Store"
  | "Device & Security"
  | "Online Storefront";

export interface GuideItem {
  id: string;
  title: string;
  category: GuideCategory;
  badge?: string;
  readTime: string;
  videoDuration: string;
  summary: string;
  steps: string[];
  proTip?: string;
  videoPlaceholderText: string;
}
