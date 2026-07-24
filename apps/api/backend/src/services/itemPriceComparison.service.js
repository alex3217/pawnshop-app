const EARTH_RADIUS_MILES = 3958.7613;
const SCORE_RULE_VERSION = "pawnloop-local-price-v1";

const TITLE_ALIASES = [
  [/\bplay\s*station\s*5\b/g, "ps5"],
  [/\bplaystation\s*5\b/g, "ps5"],
  [/\bplay\s*station\s*4\b/g, "ps4"],
  [/\bplaystation\s*4\b/g, "ps4"],
  [/\bxbox\s+series\s+x\b/g, "xboxseriesx"],
  [/\bxbox\s+series\s+s\b/g, "xboxseriess"],
  [/\bnintendo\s+switch\b/g, "switch"],
  [/\bsolid\s+state\s+drive\b/g, "ssd"],
  [/\bterabytes?\b/g, "tb"],
  [/\bgigabytes?\b/g, "gb"],
];

const LOW_SIGNAL_TOKENS = new Set([
  "a",
  "an",
  "and",
  "for",
  "in",
  "of",
  "the",
  "with",
  "new",
  "used",
]);

const ACCESSORY_TOKENS = new Set([
  "adapter",
  "case",
  "charger",
  "controller",
  "cover",
  "dock",
  "headset",
  "remote",
  "stand",
]);

const VARIANT_GROUPS = [
  new Set(["digital", "disc"]),
  new Set(["pro", "slim"]),
  new Set(["cellular", "wifi"]),
  new Set(["max", "mini", "plus", "ultra"]),
];

const DEFAULTS = Object.freeze({
  radiusMiles: 25,
  freshnessDays: 30,
  perShopCap: 3,
});

export function normalizeItemTitle(value) {
  let normalized = String(value ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

  for (const [pattern, replacement] of TITLE_ALIASES) {
    normalized = normalized.replace(pattern, replacement);
  }

  return normalized.replace(/\s+/g, " ").trim();
}

function titleTokens(value) {
  return normalizeItemTitle(value)
    .split(" ")
    .filter((token) => token && !LOW_SIGNAL_TOKENS.has(token));
}

function tokenSet(value) {
  return new Set(titleTokens(value));
}

function capacityTokens(tokens) {
  const capacities = new Set();

  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    const combined = token.match(/^(\d+)(gb|tb)$/);

    if (combined) {
      capacities.add(`${Number(combined[1])}${combined[2]}`);
      continue;
    }

    if (/^\d+$/.test(token) && /^(gb|tb)$/.test(tokens[index + 1] || "")) {
      capacities.add(`${Number(token)}${tokens[index + 1]}`);
    }
  }

  return capacities;
}

function modelTokens(tokens) {
  return new Set(
    tokens.filter((token) =>
      /^(?=.*[a-z])(?=.*\d)[a-z0-9]+$/.test(token)
      && !/^\d+(gb|tb)$/.test(token)),
  );
}

function setsConflict(left, right) {
  return left.size > 0
    && right.size > 0
    && ![...left].some((token) => right.has(token));
}

function hasVariantConflict(left, right) {
  return VARIANT_GROUPS.some((group) => {
    const leftVariants = new Set([...left].filter((token) => group.has(token)));
    const rightVariants = new Set([...right].filter((token) => group.has(token)));
    return setsConflict(leftVariants, rightVariants);
  });
}

export function titlesAreComparable(targetTitle, candidateTitle) {
  const targetTokens = titleTokens(targetTitle);
  const candidateTokens = titleTokens(candidateTitle);

  if (targetTokens.length === 0 || candidateTokens.length === 0) return false;

  const targetSet = new Set(targetTokens);
  const candidateSet = new Set(candidateTokens);
  const targetAccessories = new Set(
    targetTokens.filter((token) => ACCESSORY_TOKENS.has(token)),
  );
  const candidateAccessories = new Set(
    candidateTokens.filter((token) => ACCESSORY_TOKENS.has(token)),
  );

  if (setsConflict(targetAccessories, candidateAccessories)) return false;
  if ((targetAccessories.size === 0) !== (candidateAccessories.size === 0)) {
    return false;
  }

  if (setsConflict(capacityTokens(targetTokens), capacityTokens(candidateTokens))) {
    return false;
  }

  if (setsConflict(modelTokens(targetTokens), modelTokens(candidateTokens))) {
    return false;
  }

  if (hasVariantConflict(targetSet, candidateSet)) return false;

  const targetSignal = targetTokens.filter(
    (token) =>
      !ACCESSORY_TOKENS.has(token)
      && !/^\d+(gb|tb)$/.test(token),
  );
  const sharedSignal = targetSignal.filter((token) => candidateSet.has(token));

  return sharedSignal.length > 0
    && sharedSignal.length / targetSignal.length >= 0.5;
}

export function coordinatesAreValid(latitude, longitude) {
  return latitude !== null
    && latitude !== undefined
    && latitude !== ""
    && longitude !== null
    && longitude !== undefined
    && longitude !== ""
    && Number.isFinite(Number(latitude))
    && Number.isFinite(Number(longitude))
    && Number(latitude) >= -90
    && Number(latitude) <= 90
    && Number(longitude) >= -180
    && Number(longitude) <= 180;
}

export function haversineMiles(from, to) {
  if (
    !coordinatesAreValid(from?.latitude, from?.longitude)
    || !coordinatesAreValid(to?.latitude, to?.longitude)
  ) {
    return null;
  }

  const radians = (degrees) => (Number(degrees) * Math.PI) / 180;
  const latitudeDelta = radians(to.latitude - from.latitude);
  const longitudeDelta = radians(to.longitude - from.longitude);
  const fromLatitude = radians(from.latitude);
  const toLatitude = radians(to.latitude);
  const haversine =
    Math.sin(latitudeDelta / 2) ** 2
    + Math.cos(fromLatitude)
      * Math.cos(toLatitude)
      * Math.sin(longitudeDelta / 2) ** 2;

  return 2 * EARTH_RADIUS_MILES
    * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine));
}

function coordinatePair(item) {
  const source = item?.coordinates || item?.shop?.coordinates || item?.shop || item;
  return {
    latitude: source?.latitude ?? source?.lat,
    longitude: source?.longitude ?? source?.lng ?? source?.lon,
  };
}

function itemDate(item) {
  return item?.listedAt ?? item?.createdAt ?? item?.updatedAt;
}

function stableComparableSort(left, right) {
  return left.distanceMiles - right.distanceMiles
    || String(left.shopId).localeCompare(String(right.shopId))
    || String(left.id).localeCompare(String(right.id))
    || Number(left.price) - Number(right.price);
}

function median(sortedValues) {
  const middle = Math.floor(sortedValues.length / 2);
  return sortedValues.length % 2
    ? sortedValues[middle]
    : (sortedValues[middle - 1] + sortedValues[middle]) / 2;
}

function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value));
}

export function calculateDealScore(price, benchmark) {
  if (
    !Number.isFinite(Number(price))
    || Number(price) <= 0
    || !Number.isFinite(Number(benchmark))
    || Number(benchmark) <= 0
  ) {
    return null;
  }

  const discountPercentage =
    ((Number(benchmark) - Number(price)) / Number(benchmark)) * 100;
  return clamp(Math.round(50 + 2 * discountPercentage), 0, 100);
}

export function calculateItemPriceComparison({
  target,
  candidates = [],
  radiusMiles = DEFAULTS.radiusMiles,
  freshnessDays = DEFAULTS.freshnessDays,
  perShopCap = DEFAULTS.perShopCap,
  now = new Date(),
} = {}) {
  const emptyResult = {
    score: null,
    dealScore: null,
    scoreRuleVersion: SCORE_RULE_VERSION,
    confidence: 0,
    benchmark: null,
    statistics: null,
    sampleCount: 0,
    shopCount: 0,
    comparables: [],
  };
  const targetCoordinates = coordinatePair(target);
  const targetPrice = Number(target?.price);
  const nowTime = new Date(now).getTime();
  const freshnessCutoff =
    nowTime - Number(freshnessDays) * 24 * 60 * 60 * 1000;

  if (
    !target
    || !coordinatesAreValid(
      targetCoordinates.latitude,
      targetCoordinates.longitude,
    )
    || !Number.isFinite(targetPrice)
    || targetPrice <= 0
    || !Number.isFinite(nowTime)
    || !Number.isFinite(Number(radiusMiles))
    || Number(radiusMiles) < 0
    || !Number.isInteger(Number(perShopCap))
    || Number(perShopCap) < 1
  ) {
    return emptyResult;
  }

  const qualified = candidates.flatMap((candidate) => {
    const candidateCoordinates = coordinatePair(candidate);
    const price = Number(candidate?.price);
    const listedTime = new Date(itemDate(candidate)).getTime();
    const distanceMiles = haversineMiles(targetCoordinates, candidateCoordinates);
    const candidateShopId = candidate?.shopId ?? candidate?.shop?.id;
    const targetShopId = target?.shopId ?? target?.shop?.id;
    const sameTarget =
      candidate?.id != null
      && target?.id != null
      && String(candidate.id) === String(target.id);
    const sameShop =
      candidateShopId != null
      && targetShopId != null
      && String(candidateShopId) === String(targetShopId);

    if (
      sameTarget
      || sameShop
      || candidateShopId == null
      || candidate?.status !== "AVAILABLE"
      || candidate?.deletedAt != null
      || candidate?.available === false
      || candidate?.category !== target.category
      || candidate?.currency !== target.currency
      || !Number.isFinite(price)
      || price <= 0
      || !Number.isFinite(listedTime)
      || listedTime < freshnessCutoff
      || distanceMiles == null
      || distanceMiles > Number(radiusMiles)
      || !titlesAreComparable(target.title, candidate.title)
    ) {
      return [];
    }

    return [{
      ...candidate,
      price,
      shopId: candidateShopId,
      distanceMiles,
    }];
  });

  qualified.sort(stableComparableSort);
  const perShopCounts = new Map();
  const comparables = qualified.filter((candidate) => {
    const count = perShopCounts.get(candidate.shopId) || 0;
    if (count >= Number(perShopCap)) return false;
    perShopCounts.set(candidate.shopId, count + 1);
    return true;
  });

  const prices = comparables.map(({ price }) => price).sort((a, b) => a - b);
  const sampleCount = prices.length;
  const shopCount = new Set(comparables.map(({ shopId }) => shopId)).size;

  if (sampleCount === 0) return emptyResult;

  const average = prices.reduce((sum, price) => sum + price, 0) / sampleCount;
  const benchmark = median(prices);
  const statistics = {
    low: prices[0],
    median: benchmark,
    average,
    high: prices[prices.length - 1],
  };
  const confidence = clamp(
    Math.round(
      (Math.min(sampleCount, 8) / 8) * 60
      + (Math.min(shopCount, 4) / 4) * 40,
    ),
    0,
    100,
  );
  const score =
    sampleCount >= 3 && shopCount >= 2
      ? calculateDealScore(targetPrice, benchmark)
      : null;

  return {
    score,
    dealScore: score,
    scoreRuleVersion: SCORE_RULE_VERSION,
    confidence,
    benchmark,
    statistics,
    sampleCount,
    shopCount,
    comparables,
  };
}

export { SCORE_RULE_VERSION };
