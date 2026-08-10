import type { BusinessAddress, OwnerApplicationUpdate } from "../services/ownerApplications";
import { BUSINESS_TYPES, SUPPORTED_COUNTRIES, REGIONS_BY_COUNTRY, OTHER_BUSINESS_TYPE_PREFIX, BUSINESS_TYPE_MAX_LENGTH } from "../../../../shared/ownerApplicationOptions.mjs";

export { BUSINESS_TYPES, SUPPORTED_COUNTRIES as COUNTRIES, OTHER_BUSINESS_TYPE_PREFIX, BUSINESS_TYPE_MAX_LENGTH };
export const US_REGIONS = REGIONS_BY_COUNTRY.US;
export const SUPPORTED_COUNTRY_CODES = new Set(SUPPORTED_COUNTRIES.map(([code]) => code));

export function regionsFor(country: string) { return REGIONS_BY_COUNTRY[country] || []; }
export function isCanonicalBusinessType(value: string) { return BUSINESS_TYPES.includes(value); }
export function parseBusinessType(value: string | null | undefined) {
  const saved = value?.trim() || "";
  if (isCanonicalBusinessType(saved)) return { selection: saved, explanation: "", legacy: "" };
  if (saved.startsWith(OTHER_BUSINESS_TYPE_PREFIX)) return { selection: "Other", explanation: saved.slice(OTHER_BUSINESS_TYPE_PREFIX.length), legacy: "" };
  return { selection: saved, explanation: "", legacy: saved };
}
export function serializeBusinessType(selection: string | null | undefined, explanation: string) {
  return selection === "Other" ? `${OTHER_BUSINESS_TYPE_PREFIX}${explanation.trim()}` : selection?.trim() || "";
}
export function normalizePhone(value: string) { const trimmed = value.trim(); if (!trimmed) return ""; return (trimmed.startsWith("+") ? "+" : "") + trimmed.replace(/\D/g, ""); }
export function normalizeWebsite(value: string) { const trimmed = value.trim(); if (!trimmed) return ""; return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`; }

export type FieldErrors = Record<string, string>;
export function validateOwnerApplication(form: OwnerApplicationUpdate, customBusinessType: string): FieldErrors {
  const errors: FieldErrors = {};
  const required = (value: unknown, key: string, label: string) => { if (typeof value !== "string" || !value.trim()) errors[key] = `${label} is required.`; };
  required(form.businessName, "businessName", "Legal business name"); required(form.businessType, "businessType", "Business type");
  if (form.businessType === "Other" && (customBusinessType.trim().length < 3 || serializeBusinessType("Other", customBusinessType).length > BUSINESS_TYPE_MAX_LENGTH)) errors.businessTypeOther = `Describe the other business type using 3 to ${BUSINESS_TYPE_MAX_LENGTH - OTHER_BUSINESS_TYPE_PREFIX.length} characters.`;
  required(form.businessEmail, "businessEmail", "Business email");
  if (form.businessEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.businessEmail)) errors.businessEmail = "Enter a valid business email.";
  if (form.businessPhone && !/^\+?\d{7,15}$/.test(normalizePhone(form.businessPhone))) errors.businessPhone = "Enter a phone number with 7 to 15 digits.";
  if (form.websiteUrl) try { const url = new URL(normalizeWebsite(form.websiteUrl)); if (!/^https?:$/.test(url.protocol)) throw new Error(); } catch { errors.websiteUrl = "Enter a valid HTTP or HTTPS website address."; }
  const address = form.businessAddress;
  required(address?.line1, "line1", "Address"); required(address?.city, "city", "City"); required(address?.country, "country", "Country"); required(address?.state, "state", "State or region"); required(address?.postalCode, "postalCode", "Postal code");
  if (address?.country && !SUPPORTED_COUNTRY_CODES.has(address.country)) errors.country = "Select a supported country.";
  const regions = regionsFor(address?.country || "");
  if (address?.state && regions.length && !regions.some(([code]) => code === address.state)) errors.state = "Select a valid state or region for the country.";
  if (address?.country === "US" && address.postalCode && !/^\d{5}(?:-\d{4})?$/.test(address.postalCode.trim())) errors.postalCode = "Enter a valid U.S. ZIP code.";
  if (address?.country === "CA" && address.postalCode && !/^[A-Z]\d[A-Z][ -]?\d[A-Z]\d$/i.test(address.postalCode.trim())) errors.postalCode = "Enter a valid Canadian postal code.";
  if (form.licenseNumber?.trim() && !form.licenseState?.trim()) errors.licenseState = "License state or region is required when a license number is provided.";
  if (form.licenseState?.trim() && !form.licenseNumber?.trim()) errors.licenseNumber = "License number is required when an issuing region is provided.";
  if (form.licenseState && regions.length && !regions.some(([code]) => code === form.licenseState)) errors.licenseState = "Select an issuing region for the selected country.";
  return errors;
}
export function blankAddress(): BusinessAddress { return { line1: "", line2: "", city: "", state: "", postalCode: "", country: "US" }; }
