import type { BusinessAddress, OwnerApplicationUpdate } from "../services/ownerApplications";

export const BUSINESS_TYPES = [
  "Traditional Pawn Shop",
  "Pawn and Jewelry",
  "Pawn and Firearms",
  "Auto/Title Pawn",
  "Online or Hybrid Pawn",
  "Multi-location Pawn Chain",
] as const;

export const COUNTRIES = [
  ["US", "United States"], ["CA", "Canada"], ["MX", "Mexico"],
  ["GB", "United Kingdom"], ["AU", "Australia"], ["NZ", "New Zealand"],
  ["IE", "Ireland"], ["FR", "France"], ["DE", "Germany"], ["ES", "Spain"],
  ["IT", "Italy"], ["NL", "Netherlands"], ["BE", "Belgium"], ["CH", "Switzerland"],
  ["AT", "Austria"], ["DK", "Denmark"], ["NO", "Norway"], ["SE", "Sweden"],
  ["FI", "Finland"], ["PL", "Poland"], ["PT", "Portugal"], ["BR", "Brazil"],
  ["AR", "Argentina"], ["CL", "Chile"], ["CO", "Colombia"], ["IN", "India"],
  ["JP", "Japan"], ["KR", "South Korea"], ["SG", "Singapore"], ["ZA", "South Africa"],
] as const;

export const US_REGIONS = [
  ["AL", "Alabama"], ["AK", "Alaska"], ["AZ", "Arizona"], ["AR", "Arkansas"],
  ["CA", "California"], ["CO", "Colorado"], ["CT", "Connecticut"], ["DE", "Delaware"],
  ["FL", "Florida"], ["GA", "Georgia"], ["HI", "Hawaii"], ["ID", "Idaho"],
  ["IL", "Illinois"], ["IN", "Indiana"], ["IA", "Iowa"], ["KS", "Kansas"],
  ["KY", "Kentucky"], ["LA", "Louisiana"], ["ME", "Maine"], ["MD", "Maryland"],
  ["MA", "Massachusetts"], ["MI", "Michigan"], ["MN", "Minnesota"], ["MS", "Mississippi"],
  ["MO", "Missouri"], ["MT", "Montana"], ["NE", "Nebraska"], ["NV", "Nevada"],
  ["NH", "New Hampshire"], ["NJ", "New Jersey"], ["NM", "New Mexico"], ["NY", "New York"],
  ["NC", "North Carolina"], ["ND", "North Dakota"], ["OH", "Ohio"], ["OK", "Oklahoma"],
  ["OR", "Oregon"], ["PA", "Pennsylvania"], ["RI", "Rhode Island"], ["SC", "South Carolina"],
  ["SD", "South Dakota"], ["TN", "Tennessee"], ["TX", "Texas"], ["UT", "Utah"],
  ["VT", "Vermont"], ["VA", "Virginia"], ["WA", "Washington"], ["WV", "West Virginia"],
  ["WI", "Wisconsin"], ["WY", "Wyoming"], ["DC", "District of Columbia"],
  ["PR", "Puerto Rico"], ["AS", "American Samoa"], ["GU", "Guam"],
  ["MP", "Northern Mariana Islands"], ["VI", "U.S. Virgin Islands"],
  ["UM", "U.S. Minor Outlying Islands"],
] as const;

const CA_REGIONS = [["AB", "Alberta"], ["BC", "British Columbia"], ["MB", "Manitoba"], ["NB", "New Brunswick"], ["NL", "Newfoundland and Labrador"], ["NS", "Nova Scotia"], ["NT", "Northwest Territories"], ["NU", "Nunavut"], ["ON", "Ontario"], ["PE", "Prince Edward Island"], ["QC", "Quebec"], ["SK", "Saskatchewan"], ["YT", "Yukon"]] as const;
const AU_REGIONS = [["ACT", "Australian Capital Territory"], ["NSW", "New South Wales"], ["NT", "Northern Territory"], ["QLD", "Queensland"], ["SA", "South Australia"], ["TAS", "Tasmania"], ["VIC", "Victoria"], ["WA", "Western Australia"]] as const;

export function regionsFor(country: string): readonly (readonly [string, string])[] {
  if (country === "US") return US_REGIONS;
  if (country === "CA") return CA_REGIONS;
  if (country === "AU") return AU_REGIONS;
  return [];
}

export function normalizePhone(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return "";
  const plus = trimmed.startsWith("+") ? "+" : "";
  return plus + trimmed.replace(/\D/g, "");
}

export function normalizeWebsite(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return "";
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
}

export type FieldErrors = Record<string, string>;
export function validateOwnerApplication(form: OwnerApplicationUpdate, customBusinessType: string): FieldErrors {
  const errors: FieldErrors = {};
  const required = (value: unknown, key: string, label: string) => {
    if (typeof value !== "string" || !value.trim()) errors[key] = `${label} is required.`;
  };
  required(form.businessName, "businessName", "Legal business name");
  required(form.businessType, "businessType", "Business type");
  if (form.businessType === "Other" && customBusinessType.trim().length < 3) errors.businessTypeOther = "Describe the other business type using at least 3 characters.";
  required(form.businessEmail, "businessEmail", "Business email");
  if (form.businessEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.businessEmail)) errors.businessEmail = "Enter a valid business email.";
  if (form.businessPhone && !/^\+?\d{7,15}$/.test(normalizePhone(form.businessPhone))) errors.businessPhone = "Enter a phone number with 7 to 15 digits.";
  if (form.websiteUrl) try { const url = new URL(normalizeWebsite(form.websiteUrl)); if (!/^https?:$/.test(url.protocol)) throw new Error(); } catch { errors.websiteUrl = "Enter a valid HTTP or HTTPS website address."; }
  const address = form.businessAddress;
  required(address?.line1, "line1", "Address"); required(address?.city, "city", "City");
  required(address?.country, "country", "Country"); required(address?.state, "state", "State or region");
  required(address?.postalCode, "postalCode", "Postal code");
  if (address?.country === "US" && address.state && !US_REGIONS.some(([code]) => code === address.state)) errors.state = "Select a valid U.S. state or territory.";
  if (address?.country === "US" && address.postalCode && !/^\d{5}(?:-\d{4})?$/.test(address.postalCode.trim())) errors.postalCode = "Enter a valid U.S. ZIP code.";
  if (address?.country === "CA" && address.postalCode && !/^[A-Z]\d[A-Z][ -]?\d[A-Z]\d$/i.test(address.postalCode.trim())) errors.postalCode = "Enter a valid Canadian postal code.";
  if (form.licenseNumber?.trim() && !form.licenseState?.trim()) errors.licenseState = "License state or region is required when a license number is provided.";
  if (form.licenseState?.trim() && !form.licenseNumber?.trim()) errors.licenseNumber = "License number is required when an issuing region is provided.";
  const regions = regionsFor(address?.country || "");
  if (form.licenseState && regions.length && !regions.some(([code]) => code === form.licenseState)) errors.licenseState = "Select an issuing region for the selected country.";
  return errors;
}

export function blankAddress(): BusinessAddress {
  return { line1: "", line2: "", city: "", state: "", postalCode: "", country: "US" };
}
