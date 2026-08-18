-- Preserve existing inventory lifecycle state after adding Item.availability.
UPDATE "Item"
SET "availability" = CASE
  WHEN "isDeleted" = true THEN 'ARCHIVED'::"InventoryAvailability"
  WHEN "status" = 'SOLD' THEN 'SOLD'::"InventoryAvailability"
  ELSE "availability"
END
WHERE "isDeleted" = true OR "status" = 'SOLD';
