export type GeoPoint = {
  latitude?: number | string | null;
  longitude?: number | string | null;
};

export function toNumber(value: number | string | null | undefined): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function hasCoordinates(point: GeoPoint | null | undefined): boolean {
  return toNumber(point?.latitude) !== null && toNumber(point?.longitude) !== null;
}

export function distanceMiles(from: GeoPoint, to: GeoPoint): number | null {
  const lat1 = toNumber(from.latitude);
  const lon1 = toNumber(from.longitude);
  const lat2 = toNumber(to.latitude);
  const lon2 = toNumber(to.longitude);

  if (lat1 === null || lon1 === null || lat2 === null || lon2 === null) {
    return null;
  }

  const earthRadiusMiles = 3958.7613;
  const toRadians = (degrees: number) => (degrees * Math.PI) / 180;

  const dLat = toRadians(lat2 - lat1);
  const dLon = toRadians(lon2 - lon1);

  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRadians(lat1)) *
      Math.cos(toRadians(lat2)) *
      Math.sin(dLon / 2) ** 2;

  return earthRadiusMiles * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function formatMiles(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return "Distance unavailable";
  }

  if (value < 0.1) return "Less than 0.1 mi away";
  return `${value.toFixed(1)} mi away`;
}

export function directionsUrl(point: GeoPoint): string | null {
  const latitude = toNumber(point.latitude);
  const longitude = toNumber(point.longitude);

  if (latitude === null || longitude === null) return null;

  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
    `${latitude},${longitude}`,
  )}`;
}
