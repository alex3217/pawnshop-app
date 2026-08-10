import test from "node:test";
import assert from "node:assert/strict";
import { addressSchema, businessTypeSchema, completeOwnerApplicationSchema, US_REGION_CODES, validateLicenseRelationship } from "../src/validation/ownerApplication.js";
import { z } from "zod";

test("accepts every canonical business type and prefixed Other values", () => {
  for (const value of ["Traditional Pawn Shop", "Pawn and Jewelry", "Pawn and Firearms", "Auto/Title Pawn", "Online or Hybrid Pawn", "Multi-location Pawn Chain", "OTHER: Estate collateral specialist"]) {
    assert.equal(businessTypeSchema.safeParse(value).success, true, value);
  }
  assert.equal(businessTypeSchema.safeParse("Other").success, false);
  assert.equal(businessTypeSchema.safeParse("  ").success, false);
});

test("complete applications reject legacy types and unsupported countries", () => {
  const valid = { businessName: "Loop Pawn", businessType: "Traditional Pawn Shop", businessEmail: "owner@example.test", businessPhone: null, websiteUrl: null, businessAddress: { line1: "1 Main", city: "Chicago", state: "IL", postalCode: "60601", country: "US" }, licenseNumber: null, licenseState: null };
  assert.equal(completeOwnerApplicationSchema.safeParse(valid).success, true);
  assert.equal(completeOwnerApplicationSchema.safeParse({ ...valid, businessType: "PAWN_SHOP" }).success, false);
  assert.equal(completeOwnerApplicationSchema.safeParse({ ...valid, businessAddress: { ...valid.businessAddress, country: "ZZ" } }).success, false);
});

test("U.S. regions include 50 states, DC, Puerto Rico, and supported territories", () => {
  assert.equal(US_REGION_CODES.size, 57);
  for (const code of ["AL", "WY", "DC", "PR", "AS", "GU", "MP", "VI", "UM"]) assert.equal(US_REGION_CODES.has(code), true);
});

test("validates country-aware regions and postal codes", () => {
  const base = { line1: "1 Main St", line2: "", city: "Chicago", state: "IL", postalCode: "60601", country: "US" };
  assert.equal(addressSchema.safeParse(base).success, true);
  assert.equal(addressSchema.safeParse({ ...base, state: "ON" }).success, false);
  assert.equal(addressSchema.safeParse({ ...base, postalCode: "A1A 1A1" }).success, false);
  assert.equal(addressSchema.safeParse({ ...base, country: "CA", state: "ON", postalCode: "A1A 1A1" }).success, true);
  assert.equal(addressSchema.safeParse({ ...base, country: "GB", state: "London", postalCode: "SW1A 1AA" }).success, true);
});

test("keeps address and license regions independent while validating their relationship", () => {
  const schema = z.object({ businessAddress: addressSchema, licenseNumber: z.string().optional(), licenseState: z.string().optional() }).superRefine(validateLicenseRelationship);
  const businessAddress = { line1: "1 Main St", city: "Chicago", state: "IL", postalCode: "60601", country: "US" };
  assert.equal(schema.safeParse({ businessAddress, licenseNumber: "WI-1", licenseState: "WI" }).success, true);
  assert.equal(schema.safeParse({ businessAddress, licenseNumber: "WI-1" }).success, false);
  assert.equal(schema.safeParse({ businessAddress, licenseNumber: "ON-1", licenseState: "ON" }).success, false);
});
