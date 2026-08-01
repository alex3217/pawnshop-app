UPDATE "PlatformPricingRule"
SET
  "metadata" = jsonb_set(
    jsonb_set("metadata", '{maxActiveListings}', '25'::jsonb, true),
    '{features}',
    '["Up to 25 active listings after trial","50 active listings during trial","Basic shop profile","Standard support"]'::jsonb,
    true
  ),
  "updatedAt" = CURRENT_TIMESTAMP
WHERE "key" = 'seller_plan_free_limits';
