import { z } from "zod";

export const BUSINESS_TYPES = new Set(["Traditional Pawn Shop", "Pawn and Jewelry", "Pawn and Firearms", "Auto/Title Pawn", "Online or Hybrid Pawn", "Multi-location Pawn Chain"]);
export const US_REGION_CODES = new Set("AL AK AZ AR CA CO CT DE FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY DC PR AS GU MP VI UM".split(" "));
const CA_REGION_CODES = new Set("AB BC MB NB NL NS NT NU ON PE QC SK YT".split(" "));
const AU_REGION_CODES = new Set("ACT NSW NT QLD SA TAS VIC WA".split(" "));
const regionCodes = (country) => country === "US" ? US_REGION_CODES : country === "CA" ? CA_REGION_CODES : country === "AU" ? AU_REGION_CODES : null;

export const optionalText = (maximum) => z.union([z.string().trim().max(maximum), z.null()]).optional();
export const businessTypeSchema = optionalText(80).superRefine((value, context) => {
  if (value === "") context.addIssue({ code: "custom", message: "Business type cannot be blank." });
  if (value === "Other") context.addIssue({ code: "custom", message: "Describe the other business type instead of submitting Other." });
  if (typeof value === "string" && value.length > 0 && !BUSINESS_TYPES.has(value) && value.trim().length < 3) context.addIssue({ code: "custom", message: "Custom business type must contain at least 3 characters." });
});
export const phoneSchema = optionalText(40).superRefine((value, context) => {
  if (value && !/^\+?\d{7,15}$/.test(value.replace(/[^\d+]/g, ""))) context.addIssue({ code: "custom", message: "Business phone must contain 7 to 15 digits." });
});
export const websiteSchema = z.union([z.url().trim().max(500).refine(value => /^https?:\/\//i.test(value), "Website must use HTTP or HTTPS."), z.literal(""), z.null()]).optional();
export const addressSchema = z.object({
  line1: z.string().trim().min(1).max(160), line2: optionalText(160), city: z.string().trim().min(1).max(100),
  state: z.string().trim().min(1).max(80), postalCode: z.string().trim().min(3).max(20),
  country: z.string().trim().length(2).toUpperCase().default("US"),
}).strict().superRefine((value, context) => {
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
