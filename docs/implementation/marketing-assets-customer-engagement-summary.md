# Marketing Assets & Customer Engagement V1 — Implementation Summary

Implemented on `feature/marketing-assets-customer-engagement-v1` without committing, pushing, applying migrations, resetting data, modifying environment files, changing prices/Stripe mappings, sending bulk messages, or issuing referral rewards.

## Architecture reused

- Existing `ShopMarketingCampaign` and scan records remain the only campaign/QR/marketing analytics system. Printable QR destinations use their stable internal redirects.
- Existing `Notification` with unique `dedupeKey` is the in-app delivery system. No email/SMS marketing channel was added.
- Existing owner/staff shop access and `marketing:read` / `marketing:write` permissions protect all owner APIs.
- Existing seller and buyer entitlement services remain authoritative. Template access was added centrally to `sellerPlan.service.js`; `PREMIUM` remains the internal Plus code.
- Existing storefront, Buyer Workspace, Marketing Center, Platform Success conventions, and `SuperAdminAuditLog` were extended in place.

## Models and migration

The nondestructive migration `20260801160000_marketing_assets_customer_engagement_v1` adds:

- `ShopFollow`: one buyer/shop relation, explicit-off alert booleans, pause, soft unsubscribe, and timestamps.
- `ReferralCode`: collision-resistant stable identities owned by an existing shop or user shape.
- `ReferralAttribution`: idempotency key, supported event type, optional attributed internal user, and minimal metadata.

No asset binary/download, notification, campaign, buyer, shop, subscription, entitlement, analytics, reward, or contact model was added. The migration was authored and validated but not applied.

## APIs

- `GET /api/shops/:shopId/marketing/assets/templates`
- `GET /api/shops/:shopId/marketing/assets/:templateType.pdf?campaignId=&itemId=`
- `GET|POST|DELETE /api/shops/:shopId/follow`
- `PATCH /api/shops/:shopId/follow/preferences`
- `GET /api/followed-shops`
- `GET /api/shops/:shopId/customer-engagement/growth`
- `GET /api/shops/:shopId/customer-engagement/referrals`
- `GET /ref/:code` and `GET /api/ref/:code`
- `POST /api/ref/:code/convert`
- `GET /api/super-admin/marketing-administration`
- `PATCH /api/super-admin/marketing-campaigns/:campaignId/status`

## Printable templates

Code-owned PDF templates delivered: `STOREFRONT_POSTER`, `WINDOW_24_7_POSTER`, `COUNTER_SIGN`, `RECEIPT_INSERT`, `PRODUCT_DISPLAY_CARD`, `NEW_ARRIVALS_FLYER`, `AUCTION_FLYER`, `SELL_OR_PAWN_FLYER`, `REVIEW_REQUEST_CARD`, and `REFERRAL_CARD`.

`pdf-lib` is the only new runtime dependency. PDFs are generated in memory, use standard page/card sizes, embed locally generated high-resolution QR PNGs with a quiet zone, sanitize printable text, load no remote content, and return safe filenames/private no-store headers. Product cards require a nondeleted `AVAILABLE` item owned by the selected shop and a matching active item campaign. Auction flyers require a live public auction. Referral cards use the shop's stable internal referral link. Other materials require the correct active internal campaign and never accept arbitrary URLs.

## Behavior and privacy

- Follow Shop requires an authenticated buyer click. Creation is idempotent and all four marketing preferences default false.
- New arrivals, deals, auctions, and announcements are individually opt-in. Pause/resume and unfollow affect shop marketing only; transactional notifications are untouched.
- The in-app dispatch foundation queries only active, unpaused, explicitly opted-in follows and deduplicates through the existing notification key.
- Owners see aggregate counts for followers, opt-ins, scans, campaigns, inquiries/messages, offers, and referrals. No endpoint returns follower identity or buyer contact data.
- Shop referral links record visits and supported registration/activation conversions. Self-referral is rejected and conversion keys are deterministic. Rewards are explicitly unavailable and zero.
- Campaign disabling is SUPER_ADMIN-only, accepts only `active=false`, requires a reason, preserves the campaign/owner data, and writes `DISABLE_MARKETING_CAMPAIGN` to the existing audit model in the same transaction.

## Frontend routes and surfaces

- `/owner/marketing`: existing Marketing Center expanded with Printable Materials, Customer Growth, and Referrals.
- `/shops/:id`: explicit Follow Shop, opt-in checkboxes, pause/resume, and unfollow.
- `/buyer/workspace`: followed-shop list and empty state.
- `/super-admin/marketing-administration`: aggregate adoption, campaign search, privacy statement, and audited disable control.

Loading, empty, error, populated, no-shop, plan-limited, and protected/unauthorized behaviors use existing route guards and local states.

## Deferred work and risks

- Automatic lifecycle-wide event fan-out is deferred. The accurate in-app dispatch service exists, but item/auction mutations are not broadly wired until authoritative publication/price-transition boundaries are consolidated; this avoids duplicate or premature sends.
- Email/SMS, real bulk delivery, arbitrary templates, remote images, stored PDF/download records, rewards, external redirects, custom/corporate templates, and advanced filters remain deferred.
- Buyer-refers-buyer and platform-owned referral-code issuance UIs are deferred; V1 production UI exposes shop-refers-buyer attribution. The schema/service shape supports internal user-owned codes without a parallel system.
- Referral visit attribution currently records each valid link open; stronger cross-device/session fraud scoring and a shared rate limiter are future hardening work.
- The existing QR scan limiter remains process-local. Horizontally scaled deployments should move scan/referral abuse limits to the existing shared rate-limiting infrastructure.
- PDF visual/scannability should receive physical print QA on supported printers before production enablement.

Suggested commit message: `feat: add marketing assets and customer engagement v1`
