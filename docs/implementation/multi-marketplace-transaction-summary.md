# Multi-Marketplace Transaction Architecture V1 Summary

The implementation adds a centralized resolver and immutable family policies while preserving deployed transaction codes. Retail remains separate-charge-and-transfer. Customer sales remain inspected, offline in-person payments. Pawn activity remains inquiry/intake only. Dealer transactions use the existing transaction, ledger, Connect, refund and dispute foundations with a new release evaluator. Community commerce is disabled.

No Prisma schema change or migration was required. Canonical family and pricing/release snapshots should be stored in existing JSON metadata when records are created. Existing records resolve from transaction type, listing type and submission intent.

Dealer release requires distinct approved active shops, business/Connect readiness, succeeded payment, fulfillment evidence, confirmed delivery/pickup, buyer acceptance or inspection deadline expiry, no dispute/refund/return hold, positive eligible cents, reconciled ledger, completed risk review when required, and no prior transfer. This evaluator does not create charges, transfers, or payouts.

Dealer risk controls accept configuration for transaction/daily limits, manual review, owner approval, inspection duration, signature, insurance and authentication. Null limit defaults mean “not activated,” not unlimited approval. Dealer fee calculation accepts a configured rule and returns an immutable snapshot; it does not alter live plan prices or fee records.
