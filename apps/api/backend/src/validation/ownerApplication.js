import { z } from "zod";
import { BUSINESS_TYPES as BUSINESS_TYPE_VALUES, SUPPORTED_COUNTRIES, REGIONS_BY_COUNTRY, OTHER_BUSINESS_TYPE_PREFIX, BUSINESS_TYPE_MAX_LENGTH } from "../../../../../shared/ownerApplicationOptions.mjs";

export const BUSINESS_TYPES = new Set(BUSINESS_TYPE_VALUES);
export const SUPPORTED_COUNTRY_CODES = new Set(SUPPORTED_COUNTRIES.map(([code]) => code));
export const US_REGION_CODES = new Set(REGIONS_BY_COUNTRY.US.map(([code]) => code));
const regionCodes = (country) => REGIONS_BY_COUNTRY[country] ? new Set(REGIONS_BY_COUNTRY[country].map(([code]) => code)) : null;
const customBusinessType = (value) => typeof value === "string" && value.startsWith(OTHER_BUSINESS_TYPE_PREFIX) && value.slice(OTHER_BUSINESS_TYPE_PREFIX.length).trim().length >= 3;

export const optionalText = (maximum) => z.union([z.string().trim().max(maximum), z.null()]).optional();
export const businessTypeSchema = optionalText(BUSINESS_TYPE_MAX_LENGTH).superRefine((value, context) => {
  if (value === "" || value === "Other") context.addIssue({ code: "custom", message: "Select a business type or provide an Other explanation." });
  if (typeof value === "string" && value.startsWith(OTHER_BUSINESS_TYPE_PREFIX) && !customBusinessType(value)) context.addIssue({ code: "custom", message: "Other business type must contain a meaningful explanation." });
});
const completeBusinessTypeSchema = z.string().trim().min(1).max(BUSINESS_TYPE_MAX_LENGTH).refine(value => BUSINESS_TYPES.has(value) || customBusinessType(value), "Select a standardized business type or provide a valid Other explanation.");
export const phoneSchema = optionalText(40).superRefine((value, context) => { if (value && !/^\+?\d{7,15}$/.test(value.replace(/[^\d+]/g, ""))) context.addIssue({ code: "custom", message: "Business phone must contain 7 to 15 digits." }); });
export const websiteSchema = z.union([z.url().trim().max(500).refine(value => /^https?:\/\//i.test(value), "Website must use HTTP or HTTPS."), z.literal(""), z.null()]).optional();
export const addressSchema = z.object({
  line1: z.string().trim().min(1).max(160), line2: optionalText(160), city: z.string().trim().min(1).max(100), state: z.string().trim().min(1).max(80), postalCode: z.string().trim().min(3).max(20), country: z.string().trim().length(2).toUpperCase(),
}).strict().superRefine((value, context) => {
  if (!SUPPORTED_COUNTRY_CODES.has(value.country)) context.addIssue({ code: "custom", path: ["country"], message: "Select a supported country." });
  const regions = regionCodes(value.country);
  if (regions && !regions.has(value.state)) context.addIssue({ code: "custom", path: ["state"], message: "State or region is not valid for the selected country." });
  if (value.country === "US" && !/^\d{5}(?:-\d{4})?$/.test(value.postalCode)) context.addIssue({ code: "custom", path: ["postalCode"], message: "Enter a valid U.S. ZIP code." });
  if (value.country === "CA" && !/^[A-Z]\d[A-Z][ -]?\d[A-Z]\d$/i.test(value.postalCode)) context.addIssue({ code: "custom", path: ["postalCode"], message: "Enter a valid Canadian postal code." });
});
export function validateLicenseRelationship(value, context) {
  const number = value.licenseNumber?.trim(); const state = value.licenseState?.trim();
  if (number && !state) context.addIssue({ code: "custom", path: ["licenseState"], message: "License state or region is required with a license number." });
  if (state && !number) context.addIssue({ code: "custom", path: ["licenseNumber"], message: "License number is required with an issuing region." });
  const country = value.businessAddress?.country; const regions = country && regionCodes(country);
  if (state && regions && !regions.has(state)) context.addIssue({ code: "custom", path: ["licenseState"], message: "License state or region is not valid for the selected country." });
}
export const completeOwnerApplicationSchema = z.object({
  businessName: z.string().trim().min(1).max(160), businessType: completeBusinessTypeSchema,
  businessEmail: z.email().trim().toLowerCase().max(254), businessPhone: phoneSchema,
  websiteUrl: websiteSchema, businessAddress: addressSchema, licenseNumber: optionalText(100), licenseState: optionalText(80),
}).superRefine(validateLicenseRelationship);
export function completeApplicationData(application) { return Object.fromEntries(Object.keys(completeOwnerApplicationSchema.shape).map(key => [key, application[key]])); }
export function validateCompleteApplication(application) { return completeOwnerApplicationSchema.safeParse(completeApplicationData(application)); }
