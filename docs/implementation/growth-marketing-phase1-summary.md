# Growth Marketing Phase 1 Summary

Date: 2026-08-01

## What already existed

- The `20260730010000_master_pawnshop_growth_center_v1` migration and its six lead/contact/activity/source/import/suppression models.
- Private Super Admin Growth Center summary, lead CRUD/archive, contacts, activities, suppression, and intentionally unavailable conversion endpoint.
- Persisted Super Admin mutation audit logging.
- Super Admin Growth dashboard, directory, and lead detail routes/pages.
- Public shop detail and available-inventory pages at ID-based `/shops/:id` routes.
- Shop staff permission and tenant-scope architecture, notification records, and saved searches.

## What was incomplete

- Growth Center was absent from the general Super Admin workspace navigation.
- The lead detail activity form could record only generic notes despite richer backend activity types.
- Shops had no stable public slug, permanent storefront QR, short redirect, campaign model/API/UI, QR downloads, or marketing analytics.
- Staff permission definitions had no marketing capabilities.
- Existing inventory scanner records were not marketing QR analytics and were not reused as such.

## Phase 1 changes

- Added Super Admin Growth Center navigation and call/email/meeting/follow-up activity choices.
- Classified Growth Center mutations as `GROWTH_LEAD` in persisted audit logs.
- Added a nullable unique `PawnShop.slug`, resolved alongside legacy IDs by public shop APIs.
- Added a single `ShopMarketingCampaign` architecture with constrained internal destination types and a scan child model.
- Added lazily provisioned permanent storefront campaigns whose default QR opens `/shops/{shopSlug}`.
- Added tenant-scoped campaign create/list/update/delete and activation/deactivation APIs.
- Added authenticated SVG and PNG QR downloads using `qrcode`.
- Added stable public `/r/:shortCode` redirects, public-resource validation, disabled/inactive handling, and no-store responses.
- Added privacy-conscious analytics containing time, referrer hostname, and coarse user-agent class only. Raw IP and persistent IP hash are not stored; an ephemeral process-keyed value is used only for per-minute abuse limiting.
- Added `marketing:read` and `marketing:write` staff permissions/capabilities.
- Added `/owner/marketing` with shop selection, permanent QR information, campaign creation, activation, deletion, QR downloads, scan counts, and loading/error/empty/populated states.

## Models and migrations affected

Existing Growth Center models and `20260730010000_master_pawnshop_growth_center_v1` were audited but not modified.

Affected schema:

- `PawnShop`: added nullable unique `slug` and campaign relation.
- `ShopMarketingCampaign`: new shop-owned campaign/short-link record.
- `ShopMarketingCampaignScan`: new privacy-conscious aggregate event source.
- `ShopMarketingDestinationType`: new internal destination enum.

New nondestructive migration: `20260801010000_growth_marketing_phase1_foundation`. It was created but not applied to any database.

## APIs affected

- `GET /api/shops/:shopId/marketing/campaigns`
- `POST /api/shops/:shopId/marketing/campaigns`
- `PATCH /api/shops/:shopId/marketing/campaigns/:campaignId`
- `DELETE /api/shops/:shopId/marketing/campaigns/:campaignId`
- `GET /api/shops/:shopId/marketing/campaigns/:campaignId/qr.svg`
- `GET /api/shops/:shopId/marketing/campaigns/:campaignId/qr.png`
- `GET /r/:shortCode` and `GET /api/r/:shortCode`
- Existing `GET /api/shops/:id` and `GET /api/shops/:id/items` now accept either a legacy ID or public slug.
- Existing Super Admin Growth endpoints remain unchanged.

## Frontend routes affected

- Added `/owner/marketing`.
- Existing `/shops/:id` is slug-compatible because its backing APIs now resolve a slug or ID.
- Existing `/super-admin/growth`, `/super-admin/growth/leads`, and `/super-admin/growth/leads/:leadId` remain and are now reachable from general Super Admin navigation.

## Authorization behavior

Super Admin prospect data remains behind the `SUPER_ADMIN` router. Marketing mutations require an approved owner, platform administrator, or active staff membership with the relevant explicit permission. Every campaign query includes both campaign ID and shop ID; inaccessible shops return 404 to avoid enumeration. Public redirects expose no prospect data, accept no caller-supplied URL, and resolve only active campaigns, active/nondeleted shops, and applicable public resources.

## Remaining Phase 2–4 work

Phase 2: CSV import operations, duplicate management, secure Claim This Shop, prospect-to-Shop conversion, registration invitations linked to prospects, onboarding linkage, multi-location prospect modeling, and transactional pipeline transition history.

Phase 3: printable marketing kit/PDFs, product/category cards, referral attribution, digital content templates, campaign calendar, and Super Admin marketing administration. External publishing integrations do not exist.

Phase 4: explicit opt-in retention automation and unsubscribe management, follow/save/alert attribution, TV/window modes, NFC, AI Marketing Studio, AI Business Coach, Shop Health Score, demand analytics, and advanced conversion attribution.

## Risks and manual steps

- Deploy the new migration through the normal reviewed deployment process before enabling the page; do not reset a database.
- Existing shops receive their slug and permanent campaign lazily on first authorized Marketing Center read. If bulk provisioning is desired, implement a reviewed idempotent job later.
- The in-memory scan limiter is process-local. A shared limiter is appropriate for horizontally scaled deployments in a later phase.
- Default campaigns may be deactivated but not deleted. Other campaigns are hard-deleted together with their scan records; retention policy may warrant archival in a later phase.
- QR assets use the request host for the stable short URL. Confirm proxy host/protocol forwarding in each deployment environment.

Suggested commit message: `feat: add growth marketing phase 1 foundation`
