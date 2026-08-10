export const BUSINESS_TYPES: readonly string[];
export const SUPPORTED_COUNTRIES: readonly (readonly [string, string])[];
export const REGIONS_BY_COUNTRY: Readonly<Record<string, readonly (readonly [string, string])[]>>;
export const OTHER_BUSINESS_TYPE_PREFIX: "OTHER: ";
export const BUSINESS_TYPE_MAX_LENGTH: 80;
export function postalCodeError(country: string, postalCode: string | null | undefined): string | null;
