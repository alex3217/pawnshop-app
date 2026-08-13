import { coordinatesAreValid, isCompleteShopAddress, normalizeShopAddress } from "./shopGeocoding.service.js";

export async function backfillShopCoordinates({ prisma, geocoder, dryRun = true }) {
  const shops = await prisma.pawnShop.findMany({
    where: {
      isDeleted: false,
      address: { not: null },
      city: { not: null },
      state: { not: null },
      zip: { not: null },
      OR: [{ latitude: null }, { longitude: null }],
    },
    select: { id: true, address: true, city: true, state: true, zip: true, country: true },
    orderBy: { id: "asc" },
  });
  const report = { dryRun: Boolean(dryRun), updated: [], skipped: [], failed: [] };

  for (const shop of shops) {
    const address = normalizeShopAddress(shop);
    if (!isCompleteShopAddress(address)) {
      report.skipped.push({ id: shop.id, reason: "INCOMPLETE_ADDRESS" });
      continue;
    }
    if (dryRun) {
      report.skipped.push({ id: shop.id, reason: "DRY_RUN_ELIGIBLE" });
      continue;
    }
    try {
      const result = await geocoder.geocode(address);
      if (!coordinatesAreValid(result.latitude, result.longitude)) throw new Error("Invalid coordinates");
      await prisma.pawnShop.update({
        where: { id: shop.id },
        data: { ...result.address, latitude: result.latitude, longitude: result.longitude },
        select: { id: true },
      });
      report.updated.push({ id: shop.id });
    } catch (error) {
      report.failed.push({ id: shop.id, reason: error?.code || "GEOCODING_FAILED", error: error?.message || "Geocoding failed" });
    }
  }
  return report;
}
