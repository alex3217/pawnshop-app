UPDATE "PlatformPricingRule"
SET
  "metadata" = jsonb_set(
    jsonb_set(
      COALESCE("metadata", '{}'::jsonb),
      '{maxActiveListings}',
      '20'::jsonb,
      true
    ),
    '{features}',
    '["Up to 20 active products","50 active products during trial","Basic shop profile","Standard support"]'::jsonb,
    true
  ),
  "updatedAt" = CURRENT_TIMESTAMP
WHERE "key" = 'seller_plan_free_limits';
