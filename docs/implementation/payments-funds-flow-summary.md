# Payments and funds-flow hardening summary

PawnLoop retains its existing single-shop platform-charge plus separate-transfer architecture. A purchase is reserved from server-owned listing data; commission and seller proceeds are snapshotted in integer cents; Stripe receives a platform PaymentIntent; successful webhook processing finalizes inventory; eligible immutable seller-ledger credits can later fund one idempotent Transfer to the shop's connected account; Stripe separately controls bank payouts.

This change rejects raw card/bank fields at the API boundary, revalidates listing/shop/seller ownership and financial snapshots at PaymentIntent creation, labels the preserved charge model in safe Stripe metadata, and adds a mutation-free reconciliation classifier. It does not introduce destination charges, a second ledger, multi-shop carts, a custom bank form, schema changes, prices, products, or live Stripe operations.

Remaining material gaps are authoritative Stripe balance-transaction fee ingestion, an authorized provider-backed reconciliation API/batch, unified refund/dispute finance rollups, and an approved seller-loss/inventory policy for disputes and refunds.

