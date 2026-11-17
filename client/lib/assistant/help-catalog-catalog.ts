import type { HelpTopic } from "./help-catalog";

export const CATALOG_HELP_TOPICS: HelpTopic[] = [
  {
    id: "print_labels",
    title: "Print barcode labels",
    href: "/inventory/catalog",
    steps: [
      "Go to Inventory > Catalog",
      "Right-click the product and choose Print barcode label",
      "Enter how many labels and pick Label roll or A4 sheet",
      "On a partly used A4 sheet, set Start at position, then tap Print",
      "For many products at once, filter the catalog and tap Print labels beside the search box",
    ],
    keywords: ["barcode label", "price label", "print labels", "sticker", "label sheet"],
    phrases: [
      /\bprint (a |the |some |my )?(barcode |price |product )?(labels?|stickers?|tags?)\b/,
      /\b(barcode|price|product) (labels?|stickers?|tags?)\b/,
      /\blabel (sheets?|rolls?|printer)\b/,
    ],
    requiredPermission: "print_product_labels",
  },
  {
    id: "product_images",
    title: "Add a product photo",
    href: "/inventory/catalog",
    steps: [
      "Go to Inventory > Catalog and select the product",
      "In the Image section of the details panel, tap Upload image",
      "Pick a photo or take one; it is shrunk and saved for every till and your online store",
      "Use Replace image to change it or Remove image to go back to the category icon",
      "Slow till? Turn off Show product images in POS grid under Settings > Register Configs",
    ],
    keywords: ["product image", "product photo", "product picture", "upload image", "item photo"],
    phrases: [
      /\b(add|upload|change|replace|remove|set) (a |an |the )?(product )?(photo|image|picture|pic)\b/,
      /\b(product|item) (photos?|images?|pictures?)\b/,
    ],
    requiredPermission: "manage_products",
  },
];
