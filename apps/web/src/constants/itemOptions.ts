export const ITEM_CONDITION_OPTIONS = [
  "New",
  "Like New",
  "Excellent",
  "Good",
  "Fair",
  "Poor",
  "For Parts",
] as const;

export const ITEM_CATEGORY_OPTIONS = [
  "Jewelry",
  "Electronics",
  "Musical Instruments",
  "Tools",
  "Collectibles",
  "Watches",
  "Designer Goods",
  "Sports Equipment",
  "Appliances",
  "Vehicles",
  "Other",
] as const;

export type ItemCondition = (typeof ITEM_CONDITION_OPTIONS)[number];
export type ItemCategory = (typeof ITEM_CATEGORY_OPTIONS)[number];
