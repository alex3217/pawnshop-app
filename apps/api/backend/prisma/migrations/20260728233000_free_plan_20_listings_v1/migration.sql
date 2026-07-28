INSERT INTO "PlatformPricingRule" (
  "id",
  "key",
  "label",
  "description",
  "category",
  "appliesTo",
  "feeType",
  "amountCents",
  "currency",
  "status",
  "metadata",
  "createdAt",
  "updatedAt"
)
VALUES (
  'pricing_rule_seller_plan_free_limits_v1',
  'seller_plan_free_limits',
  'Free seller plan limits',
  'Free seller plan limits after the introductory trial.',
  'SUBSCRIPTIONS',
  'SELLER',
  'FIXED_CENTS',
  0,
  'USD',
  'ACTIVE',
  '{"label":"Free","maxActiveListings":20,"trialMaxActiveListings":50,"maxLocations":1,"maxStaffUsers":1,"canCreateAuctions":false,"canFeatureListings":false,"analyticsLevel":"none","features":["Up to 20 active listings after trial","50 active listings during trial","Basic shop profile","Standard support"]}'::jsonb,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
)
ON CONFLICT ("key") DO UPDATE
SET
  "label" = EXCLUDED."label",
  "description" = EXCLUDED."description",
  "category" = EXCLUDED."category",
  "appliesTo" = EXCLUDED."appliesTo",
  "feeType" = EXCLUDED."feeType",
  "amountCents" = EXCLUDED."amountCents",
  "currency" = EXCLUDED."currency",
  "status" = EXCLUDED."status",
  "metadata" = EXCLUDED."metadata",
  "updatedAt" = CURRENT_TIMESTAMP;
