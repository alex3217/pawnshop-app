export type FoundingShopProgramSettings = {
  enabled: boolean;
  trialDays: number;
  shopLimit: number;
  minimumLiveItems: number;
  freeUploadCount: number;
  starterMonthlyPrice: number;
  proMonthlyPrice: number;
  premiumMonthlyPrice: number;
  headline: string;
  subtitle: string;
};

export const DEFAULT_FOUNDING_SHOP_PROGRAM: FoundingShopProgramSettings = {
  enabled: true,
  trialDays: 60,
  shopLimit: 25,
  minimumLiveItems: 10,
  freeUploadCount: 25,
  starterMonthlyPrice: 49,
  proMonthlyPrice: 99,
  premiumMonthlyPrice: 199,
  headline: "60-Day Founding Shop Trial",
  subtitle: "We help pawn shops build inventory before buyer traffic scales.",
};

function apiBase() {
  const raw =
    import.meta.env.VITE_API_BASE_URL ||
    import.meta.env.VITE_API_BASE ||
    "/api";
  return String(raw).replace(/\/+$/, "");
}

function toBoolean(value: unknown, fallback: boolean) {
  if (typeof value === "boolean") return value;
  const normalized = String(value ?? "").trim().toLowerCase();
  if (["true", "1", "yes", "on"].includes(normalized)) return true;
  if (["false", "0", "no", "off"].includes(normalized)) return false;
  return fallback;
}

function toNumber(value: unknown, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

function toStringValue(value: unknown, fallback: string) {
  const text = String(value ?? "").trim();
  return text || fallback;
}

export function normalizeFoundingShopProgram(
  value: Partial<FoundingShopProgramSettings> | null | undefined,
): FoundingShopProgramSettings {
  const fallback = DEFAULT_FOUNDING_SHOP_PROGRAM;

  return {
    enabled: toBoolean(value?.enabled, fallback.enabled),
    trialDays: toNumber(value?.trialDays, fallback.trialDays),
    shopLimit: toNumber(value?.shopLimit, fallback.shopLimit),
    minimumLiveItems: toNumber(value?.minimumLiveItems, fallback.minimumLiveItems),
    freeUploadCount: toNumber(value?.freeUploadCount, fallback.freeUploadCount),
    starterMonthlyPrice: toNumber(value?.starterMonthlyPrice, fallback.starterMonthlyPrice),
    proMonthlyPrice: toNumber(value?.proMonthlyPrice, fallback.proMonthlyPrice),
    premiumMonthlyPrice: toNumber(value?.premiumMonthlyPrice, fallback.premiumMonthlyPrice),
    headline: toStringValue(value?.headline, fallback.headline),
    subtitle: toStringValue(value?.subtitle, fallback.subtitle),
  };
}

export async function getFoundingShopProgramSettings(
  signal?: AbortSignal,
): Promise<FoundingShopProgramSettings> {
  try {
    const response = await fetch(
      `${apiBase()}/platform-settings/founding-shop-program`,
      { signal },
    );

    if (!response.ok) return DEFAULT_FOUNDING_SHOP_PROGRAM;

    const json = await response.json();
    return normalizeFoundingShopProgram(json?.program);
  } catch {
    return DEFAULT_FOUNDING_SHOP_PROGRAM;
  }
}
