import type { BusinessAddress, OwnerApplication, OwnerApplicationUpdate } from "../services/ownerApplications";
import { BUSINESS_TYPES, SUPPORTED_COUNTRIES, REGIONS_BY_COUNTRY, OTHER_BUSINESS_TYPE_PREFIX, BUSINESS_TYPE_MAX_LENGTH, postalCodeError } from "../../../../shared/ownerApplicationOptions.mjs";

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
export function validateOwnerApplicationSave(form: OwnerApplicationUpdate, customBusinessType: string): FieldErrors {
  const errors: FieldErrors = {};
  if (form.businessName && form.businessName.trim().length > 160) errors.businessName = "Legal business name must be 160 characters or fewer.";
  if (form.businessType && form.businessType !== "Other" && !isCanonicalBusinessType(form.businessType)) errors.businessType = "Replace the saved legacy value with a standardized business type.";
  if (form.businessType === "Other" && (customBusinessType.trim().length < 3 || serializeBusinessType("Other", customBusinessType).length > BUSINESS_TYPE_MAX_LENGTH)) errors.businessTypeOther = `Describe the other business type using 3 to ${BUSINESS_TYPE_MAX_LENGTH - OTHER_BUSINESS_TYPE_PREFIX.length} characters.`;
  if (form.businessEmail && (form.businessEmail.trim().length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.businessEmail))) errors.businessEmail = "Enter a valid business email of 254 characters or fewer.";
  if (form.businessPhone && form.businessPhone.trim().length > 40) errors.businessPhone = "Business phone must be 40 characters or fewer.";
  if (form.businessPhone && !/^\+?\d{7,15}$/.test(normalizePhone(form.businessPhone))) errors.businessPhone = "Enter a phone number with 7 to 15 digits.";
  if (form.websiteUrl && form.websiteUrl.trim().length > 500) errors.websiteUrl = "Website must be 500 characters or fewer.";
  else if (form.websiteUrl) try { const url = new URL(normalizeWebsite(form.websiteUrl)); if (!/^https?:$/.test(url.protocol)) throw new Error(); } catch { errors.websiteUrl = "Enter a valid HTTP or HTTPS website address."; }
  const address = form.businessAddress;
  if (address?.line1 && address.line1.trim().length > 160) errors.line1 = "Address must be 160 characters or fewer.";
  if (address?.city && address.city.trim().length > 100) errors.city = "City must be 100 characters or fewer.";
  if (address?.state && address.state.trim().length > 80) errors.state = "State or region must be 80 characters or fewer.";
  if (address?.postalCode && address.postalCode.trim().length > 20) errors.postalCode = "Postal code must be 20 characters or fewer.";
  if (address?.country && !SUPPORTED_COUNTRY_CODES.has(address.country)) errors.country = "Select a supported country.";
  const regions = regionsFor(address?.country || "");
  if (address?.state && regions.length && !regions.some(([code]) => code === address.state)) errors.state = "Select a valid state or region for the country.";
  if (address?.country && address.postalCode) { const message = postalCodeError(address.country, address.postalCode); if (message) errors.postalCode = message; }
  if (form.licenseNumber?.trim() && !form.licenseState?.trim()) errors.licenseState = "License state or region is required when a license number is provided.";
  if (form.licenseNumber && form.licenseNumber.trim().length > 100) errors.licenseNumber = "License number must be 100 characters or fewer.";
  if (form.licenseState && form.licenseState.trim().length > 80) errors.licenseState = "License state or region must be 80 characters or fewer.";
  if (form.licenseState?.trim() && !form.licenseNumber?.trim()) errors.licenseNumber = "License number is required when an issuing region is provided.";
  if (form.licenseState && regions.length && !regions.some(([code]) => code === form.licenseState)) errors.licenseState = "Select an issuing region for the selected country.";
  return errors;
}
export function validateOwnerApplication(form: OwnerApplicationUpdate, customBusinessType: string): FieldErrors {
  const errors = validateOwnerApplicationSave(form, customBusinessType);
  const required = (value: unknown, key: string, label: string) => { if (typeof value !== "string" || !value.trim()) errors[key] = `${label} is required.`; };
  required(form.businessName, "businessName", "Legal business name"); required(form.businessType, "businessType", "Business type"); required(form.businessEmail, "businessEmail", "Business email");
  required(form.businessAddress?.line1, "line1", "Address"); required(form.businessAddress?.city, "city", "City"); required(form.businessAddress?.country, "country", "Country"); required(form.businessAddress?.state, "state", "State or region"); required(form.businessAddress?.postalCode, "postalCode", "Postal code");
  return errors;
}
export function blankAddress(country = ""): BusinessAddress { return { line1: "", line2: "", city: "", state: "", postalCode: "", country }; }
export function isGenuinelyNewDraft(application: OwnerApplication) {
  return application.status === "DRAFT" && !application.businessAddress && !application.businessName?.trim() && !application.businessType?.trim() && !application.businessPhone?.trim() && !application.websiteUrl?.trim() && !application.licenseNumber?.trim() && !application.licenseState?.trim() && !application.submittedAt;
}
export function addressValuesFrom(application: OwnerApplication) { return application.businessAddress || blankAddress(isGenuinelyNewDraft(application) ? "US" : ""); }
