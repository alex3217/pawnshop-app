const DEFAULT_TIMEOUT_MS = 5000;
const GOOGLE_GEOCODING_URL = "https://maps.googleapis.com/maps/api/geocode/json";

export class ShopGeocodingError extends Error {
  constructor(message, { code = "GEOCODING_FAILED", statusCode = 422 } = {}) {
    super(message);
    this.name = "ShopGeocodingError";
    this.code = code;
    this.statusCode = statusCode;
  }
}

export function coordinatesAreValid(latitude, longitude) {
  return Number.isFinite(latitude)
    && latitude >= -90
    && latitude <= 90
    && Number.isFinite(longitude)
    && longitude >= -180
    && longitude <= 180
    && !(latitude === 0 && longitude === 0);
}

export function normalizeShopAddress(address = {}) {
  const normalize = (value) => String(value ?? "").trim().replace(/\s+/g, " ");
  return {
    address: normalize(address.address),
    city: normalize(address.city),
    state: normalize(address.state).toUpperCase(),
    zip: normalize(address.zip ?? address.postalCode).toUpperCase(),
    country: normalize(address.country || "US").toUpperCase(),
  };
}

export function isCompleteShopAddress(address) {
  const value = normalizeShopAddress(address);
  return Boolean(value.address && value.city && value.state && value.zip && value.country);
}

export function shopAddressChanged(previous, next) {
  const before = normalizeShopAddress(previous);
  const after = normalizeShopAddress(next);
  return Object.keys(after).some((key) => before[key] !== after[key]);
}

function geocodingConfig(env = process.env) {
  const provider = String(env.GEOCODING_PROVIDER || "").trim().toLowerCase();
  const timeoutMs = Number(env.GEOCODING_TIMEOUT_MS || DEFAULT_TIMEOUT_MS);
  if (provider !== "google") {
    throw new ShopGeocodingError(
      "Location verification is not configured. Contact PawnLoop support.",
      { code: "GEOCODING_NOT_CONFIGURED", statusCode: 503 },
    );
  }
  if (!env.GOOGLE_GEOCODING_API_KEY) {
    throw new ShopGeocodingError(
      "Location verification is not configured. Contact PawnLoop support.",
      { code: "GEOCODING_NOT_CONFIGURED", statusCode: 503 },
    );
  }
  if (!Number.isInteger(timeoutMs) || timeoutMs < 100 || timeoutMs > 30000) {
    throw new ShopGeocodingError("GEOCODING_TIMEOUT_MS must be an integer from 100 through 30000.", {
      code: "GEOCODING_NOT_CONFIGURED",
      statusCode: 503,
    });
  }
  return { apiKey: env.GOOGLE_GEOCODING_API_KEY, timeoutMs };
}

export function createShopGeocoder({ env = process.env, fetchImpl = globalThis.fetch } = {}) {
  return {
    async geocode(input) {
      const address = normalizeShopAddress(input);
      if (!isCompleteShopAddress(address)) {
        throw new ShopGeocodingError(
          "Enter a complete street address, city, state, ZIP/postal code, and country before verifying the location.",
          { code: "ADDRESS_INCOMPLETE" },
        );
      }
      const { apiKey, timeoutMs } = geocodingConfig(env);
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const query = new URLSearchParams({
          address: [address.address, address.city, address.state, address.zip, address.country].join(", "),
          key: apiKey,
        });
        const response = await fetchImpl(`${GOOGLE_GEOCODING_URL}?${query}`, { signal: controller.signal });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const payload = await response.json();
        if (payload?.status === "ZERO_RESULTS") {
          throw new ShopGeocodingError(
            "We could not locate that address. Check the street, city, state, ZIP/postal code, and country, then try again.",
            { code: "ADDRESS_NOT_FOUND" },
          );
        }
        if (payload?.status !== "OK" || !payload.results?.length) throw new Error(payload?.status || "invalid response");
        const location = payload.results[0]?.geometry?.location;
        const latitude = Number(location?.lat);
        const longitude = Number(location?.lng);
        if (!coordinatesAreValid(latitude, longitude)) {
          throw new ShopGeocodingError("The location provider returned invalid coordinates. Try again or contact PawnLoop support.", {
            code: "INVALID_COORDINATES",
            statusCode: 502,
          });
        }
        return { address, latitude, longitude };
      } catch (error) {
        if (error instanceof ShopGeocodingError) throw error;
        if (error?.name === "AbortError") {
          throw new ShopGeocodingError("Location verification timed out. Try again.", { code: "GEOCODING_TIMEOUT", statusCode: 504 });
        }
        throw new ShopGeocodingError("Location verification is temporarily unavailable. Try again.", {
          code: "GEOCODING_UNAVAILABLE",
          statusCode: 502,
        });
      } finally {
        clearTimeout(timeout);
      }
    },
  };
}

export function getShopGeocoder(req) {
  return req?.app?.locals?.shopGeocoder || createShopGeocoder();
}
