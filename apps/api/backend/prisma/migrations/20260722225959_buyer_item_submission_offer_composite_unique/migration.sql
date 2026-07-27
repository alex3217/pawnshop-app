DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = '"BuyerItemSubmissionOffer"'::regclass
      AND conname = 'BuyerItemSubmissionOffer_id_submissionId_key'
  ) THEN
    NULL;
  ELSIF EXISTS (
    SELECT 1
    FROM pg_index
    WHERE indexrelid = to_regclass('"BuyerItemSubmissionOffer_id_submissionId_key"')
      AND indrelid = '"BuyerItemSubmissionOffer"'::regclass
      AND indisunique
  ) THEN
    ALTER TABLE "BuyerItemSubmissionOffer"
      ADD CONSTRAINT "BuyerItemSubmissionOffer_id_submissionId_key"
      UNIQUE USING INDEX "BuyerItemSubmissionOffer_id_submissionId_key";
  ELSE
    ALTER TABLE "BuyerItemSubmissionOffer"
      ADD CONSTRAINT "BuyerItemSubmissionOffer_id_submissionId_key"
      UNIQUE ("id", "submissionId");
  END IF;
END
$$;
