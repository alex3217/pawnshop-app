-- Safety follow-up: the production preflight must prove zero violations first.
-- VALIDATE CONSTRAINT takes a less disruptive lock than adding the constraint.
ALTER TABLE "MarketplaceListing"
VALIDATE CONSTRAINT "MarketplaceListing_destination_type_check";
