# Multi-Marketplace Transaction Audit

Audit date: 2026-08-01. Branch: `feature/multi-marketplace-transaction-architecture-v1`.

| Transaction family | Existing implementation and codes | Existing routes and data model | Status | Compatibility / financial / legal risk | V1 decision |
|---|---|---|---|---|---|
| Retail buyer to shop | `DIRECT_PURCHASE`, `ACCEPTED_OFFER`; `SHOP_TO_CUSTOMER`; reservations, PaymentIntents, webhooks, fulfillment, ledger, refunds, disputes, payouts | `/marketplace`, `/marketplace/buy/:id`, `/marketplace/checkout/:id`, `/marketplace/transactions/*`; `MarketplaceListing`, `MarketplaceTransaction`, `Settlement`, `SellerBalanceLedger`, Stripe refund/dispute and payout models | Complete foundation | Renaming deployed codes would break records; destination charges would change financial behavior | Map to `RETAIL_BUYER_TO_SHOP`; preserve behavior and separate charge/transfer |
| Customer sell to shop | `CUSTOMER_SELL_TO_SHOP`, `CUSTOMER_TO_SHOP`; offline cash/shop-check fulfillment | `/sell`, owner item-intake and customer-sell transaction actions; `BuyerItemSubmission`, offer, `ItemIntake`, customer sell fulfillment/payment/receipt | Complete V1 sale handoff; partial appointment state | Stripe refund is not a customer payout; stolen-property and local compliance remain shop duties | Map sell intent to `CUSTOMER_SELL_TO_SHOP`; keep inspection and offline payment |
| Customer pawn inquiry | Submission intent `PAWN_OFFERS` shares submission/offer/intake | `/sell`, buyer submission and owner intake routes | Partial | Treating inquiry as retail payment could make PawnLoop appear lender; lending rules are jurisdiction-specific | Map pawn intent to `CUSTOMER_PAWN_TO_SHOP`; discovery, review, messaging, appointment/status only; no online loan |
| Dealer shop to shop | `DEALER_TRANSFER`, `SHOP_TO_SHOP`; buying/selling shop fields already exist | Existing marketplace listing/reservation/transaction routes; empty `DealerMarketplacePage`; shared transaction, ledger, refund/dispute, Connect/payout models | Partial | Existing generic payment could release under retail rules; own-shop and cross-shop authorization risk | Map to `DEALER_SHOP_TO_SHOP`; add protected-payment policy and release evaluator before transfers |
| Community customer to customer | `CUSTOMER_TO_CUSTOMER` listing type exists and some legacy tests/paths permit generic transactions | General marketplace routes/models | Architecture present but activation not approved | Highest fraud, verification, policy, tax and legal risk | Map to `COMMUNITY_CUSTOMER_TO_CUSTOMER`; policy reports disabled; no new purchase actions |

## Cross-cutting audit

- Auctions, bids, offers and settlements are retail-oriented and carry no explicit family field. `Settlement.transactionType` is a string compatibility hook. Dealer offer/auction settlement must be gated before activation.
- `MarketplaceTransaction` already stores both user and shop identities, immutable amounts, PaymentIntent reference, fulfillment status and metadata. Metadata can carry canonical family and policy snapshots without a schema change.
- `SellerBalanceLedger`, `SellerPayout`, Stripe Connect, refunds, disputes and reconciliation are reusable. Transfers occur only in the payout request service and remain separate from charges.
- Permissions existed for inventory, auctions, offers, settlements and customer sell; dealer permissions were missing.
- Messaging/notification systems exist; no separate system is warranted. No suitable dedicated wanted-request model exists, so V1 reserves Wanted Inventory rather than introducing a duplicate inquiry system.
- Existing migrations already introduced marketplace and customer-sale models. No schema change is essential for this compatibility/policy phase, so no migration was created or applied.
- `DealerMarketplacePage.tsx` existed but was empty. Buyer sell and owner intake pages are substantial and already distinguish submission/intake operations, though pawn terminology needs continued product review.
