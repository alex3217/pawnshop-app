import { prisma } from "../lib/prisma.js";

const FOUNDING_SHOP_PROGRAM_DEFAULTS = Object.freeze({
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
});

const FOUNDING_SHOP_SETTING_MAP = Object.freeze({
  "foundingShop.programEnabled": ["enabled", "boolean"],
  "foundingShop.trialDays": ["trialDays", "number"],
  "foundingShop.shopLimit": ["shopLimit", "number"],
  "foundingShop.minimumLiveItems": ["minimumLiveItems", "number"],
  "foundingShop.freeUploadCount": ["freeUploadCount", "number"],
  "foundingShop.starterMonthlyPrice": ["starterMonthlyPrice", "number"],
  "foundingShop.proMonthlyPrice": ["proMonthlyPrice", "number"],
  "foundingShop.premiumMonthlyPrice": ["premiumMonthlyPrice", "number"],
  "foundingShop.headline": ["headline", "string"],
  "foundingShop.subtitle": ["subtitle", "string"],
});

function parseBoolean(value, fallback) {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (["true", "1", "yes", "on"].includes(normalized)) return true;
  if (["false", "0", "no", "off"].includes(normalized)) return false;
  return fallback;
}

function parseNumber(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

function parseValue(value, type, fallback) {
  if (type === "boolean") return parseBoolean(value, fallback);
  if (type === "number") return parseNumber(value, fallback);
  const text = String(value ?? "").trim();
  return text || fallback;
}

export async function getFoundingShopProgramSettings(_req, res) {
  try {
    const keys = Object.keys(FOUNDING_SHOP_SETTING_MAP);
    const rows = await prisma.platformSetting.findMany({
      where: { key: { in: keys } },
      select: { key: true, value: true, updatedAt: true },
    });

    const program = { ...FOUNDING_SHOP_PROGRAM_DEFAULTS };

    for (const row of rows) {
      const [field, type] = FOUNDING_SHOP_SETTING_MAP[row.key] || [];
      if (!field) continue;
      program[field] = parseValue(row.value, type, program[field]);
    }

    return res.json({
      success: true,
      program,
      defaults: FOUNDING_SHOP_PROGRAM_DEFAULTS,
      keys,
    });
  } catch (err) {
    console.warn("[platform-settings-public] Failed to load founding shop program settings", err);
    return res.json({
      success: true,
      program: FOUNDING_SHOP_PROGRAM_DEFAULTS,
      defaults: FOUNDING_SHOP_PROGRAM_DEFAULTS,
      fallback: true,
    });
  }
}
