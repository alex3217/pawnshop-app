export function formatShopAddress(address?: string | null, city?: string | null, state?: string | null, zip?: string | null) {
  return [address, [city, state].filter(Boolean).join(", "), zip]
    .map((part) => String(part || "").trim())
    .filter(Boolean)
    .join(" ") || "Shop address not listed";
}
