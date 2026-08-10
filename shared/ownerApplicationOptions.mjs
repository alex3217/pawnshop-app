export const BUSINESS_TYPES = Object.freeze([
  "Traditional Pawn Shop", "Pawn and Jewelry", "Pawn and Firearms",
  "Auto/Title Pawn", "Online or Hybrid Pawn", "Multi-location Pawn Chain",
]);

export const SUPPORTED_COUNTRIES = Object.freeze([
  ["US", "United States"], ["CA", "Canada"], ["MX", "Mexico"],
  ["GB", "United Kingdom"], ["AU", "Australia"], ["NZ", "New Zealand"],
  ["IE", "Ireland"], ["FR", "France"], ["DE", "Germany"], ["ES", "Spain"],
  ["IT", "Italy"], ["NL", "Netherlands"], ["BE", "Belgium"], ["CH", "Switzerland"],
  ["AT", "Austria"], ["DK", "Denmark"], ["NO", "Norway"], ["SE", "Sweden"],
  ["FI", "Finland"], ["PL", "Poland"], ["PT", "Portugal"], ["BR", "Brazil"],
  ["AR", "Argentina"], ["CL", "Chile"], ["CO", "Colombia"], ["IN", "India"],
  ["JP", "Japan"], ["KR", "South Korea"], ["SG", "Singapore"], ["ZA", "South Africa"],
]);

export const REGIONS_BY_COUNTRY = Object.freeze({
  US: Object.freeze([
    ["AL", "Alabama"], ["AK", "Alaska"], ["AZ", "Arizona"], ["AR", "Arkansas"], ["CA", "California"], ["CO", "Colorado"], ["CT", "Connecticut"], ["DE", "Delaware"], ["FL", "Florida"], ["GA", "Georgia"], ["HI", "Hawaii"], ["ID", "Idaho"], ["IL", "Illinois"], ["IN", "Indiana"], ["IA", "Iowa"], ["KS", "Kansas"], ["KY", "Kentucky"], ["LA", "Louisiana"], ["ME", "Maine"], ["MD", "Maryland"], ["MA", "Massachusetts"], ["MI", "Michigan"], ["MN", "Minnesota"], ["MS", "Mississippi"], ["MO", "Missouri"], ["MT", "Montana"], ["NE", "Nebraska"], ["NV", "Nevada"], ["NH", "New Hampshire"], ["NJ", "New Jersey"], ["NM", "New Mexico"], ["NY", "New York"], ["NC", "North Carolina"], ["ND", "North Dakota"], ["OH", "Ohio"], ["OK", "Oklahoma"], ["OR", "Oregon"], ["PA", "Pennsylvania"], ["RI", "Rhode Island"], ["SC", "South Carolina"], ["SD", "South Dakota"], ["TN", "Tennessee"], ["TX", "Texas"], ["UT", "Utah"], ["VT", "Vermont"], ["VA", "Virginia"], ["WA", "Washington"], ["WV", "West Virginia"], ["WI", "Wisconsin"], ["WY", "Wyoming"], ["DC", "District of Columbia"], ["PR", "Puerto Rico"], ["AS", "American Samoa"], ["GU", "Guam"], ["MP", "Northern Mariana Islands"], ["VI", "U.S. Virgin Islands"], ["UM", "U.S. Minor Outlying Islands"],
  ]),
  CA: Object.freeze([["AB", "Alberta"], ["BC", "British Columbia"], ["MB", "Manitoba"], ["NB", "New Brunswick"], ["NL", "Newfoundland and Labrador"], ["NS", "Nova Scotia"], ["NT", "Northwest Territories"], ["NU", "Nunavut"], ["ON", "Ontario"], ["PE", "Prince Edward Island"], ["QC", "Quebec"], ["SK", "Saskatchewan"], ["YT", "Yukon"]]),
  AU: Object.freeze([["ACT", "Australian Capital Territory"], ["NSW", "New South Wales"], ["NT", "Northern Territory"], ["QLD", "Queensland"], ["SA", "South Australia"], ["TAS", "Tasmania"], ["VIC", "Victoria"], ["WA", "Western Australia"]]),
});

export const OTHER_BUSINESS_TYPE_PREFIX = "OTHER: ";
export const BUSINESS_TYPE_MAX_LENGTH = 80;

const POSTAL_PATTERNS = Object.freeze({
  US: /^\d{5}(?:-\d{4})?$/,
  CA: /^[A-Z]\d[A-Z][ -]?\d[A-Z]\d$/i,
  AU: /^\d{4}$/,
  GB: /^(GIR 0AA|[A-Z]{1,2}\d[A-Z\d]? \d[A-Z]{2})$/i,
});
const GENERIC_POSTAL_PATTERN = /^[A-Z0-9][A-Z0-9 -]{1,10}[A-Z0-9]$/i;

export function postalCodeError(country, postalCode) {
  const value = String(postalCode || "").trim();
  if (!value) return null;
  if (country === "US" && !POSTAL_PATTERNS.US.test(value)) return "Enter a valid U.S. ZIP code.";
  if (country === "CA" && !POSTAL_PATTERNS.CA.test(value)) return "Enter a valid Canadian postal code.";
  if (country === "AU" && !POSTAL_PATTERNS.AU.test(value)) return "Enter a valid Australian postal code.";
  if (country === "GB" && !POSTAL_PATTERNS.GB.test(value)) return "Enter a valid United Kingdom postcode.";
  if (!POSTAL_PATTERNS[country] && !GENERIC_POSTAL_PATTERN.test(value)) return "Enter a postal code using 3 to 12 letters, numbers, spaces, or hyphens.";
  return null;
}
