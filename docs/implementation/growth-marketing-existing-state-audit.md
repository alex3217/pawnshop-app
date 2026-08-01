# Growth Marketing Existing-State Audit

Date: 2026-08-01

Scope: audit of `20260730010000_master_pawnshop_growth_center_v1` and the safely missing Phase 1 foundation. This report was created before application behavior was changed.

## Architecture inventory

The existing Growth Center is a private Super Admin feature built on `PawnShopLead`, `PawnShopLeadContact`, `PawnShopLeadActivity`, `PawnShopLeadSource`, `PawnShopLeadImport`, and `PawnShopLeadSuppression`. Its controller is mounted beneath the authenticated, role-restricted `/api/super-admin` router. Mutations pass through the existing persisted Super Admin audit middleware. The web application already declares `/super-admin/growth`, `/super-admin/growth/leads`, and `/super-admin/growth/leads/:leadId`, with dashboard, directory, detail, API-client, and type modules.

The public shop experience currently uses `/shops/:id` and the public API uses `/api/shops/:id`; `PawnShop` has no public slug. No owner marketing campaign, stable redirect, QR asset, or marketing scan model exists. Inventory scanning code is operational intake code and is unrelated to marketing QR analytics. Existing saved-search and notification records do not constitute marketing consent or campaign attribution.

## Requirement matrix

| Requirement | Existing implementation | Relevant files | Complete | Partial | Missing | Defect or risk | Recommended action |
|---|---|---|:---:|:---:|:---:|---|---|
| Master prospect directory | Filtered, paginated lead list | `growthCenter.controller.js`, `GrowthLeadDirectoryPage.tsx` | Yes | | | None identified for Phase 1 | Reuse |
| Registered and prospective shops | Leads may link one-to-one to `PawnShop` | Prisma schema and growth migration | | Yes | | Linking operation intentionally unavailable | Defer conversion workflow to Phase 2 |
| Contacts and addresses | Lead and contact models/API/detail UI | Growth migration, controller, detail page | Yes | | | Private data must remain Super Admin-only | Preserve authorization |
| Location count | One address per lead; no lead-location child model | Prisma schema | | | Yes | Multi-location prospects cannot be represented cleanly | Phase 2 schema design |
| Acquisition source | Lead source fields plus provenance records | `PawnShopLead`, `PawnShopLeadSource` | Yes | | | Raw payload may contain sensitive source data | Keep private |
| Assignment, priority, tags, notes | Assignee, lead score, activity notes exist | Prisma schema, controller | | Yes | | No priority enum or tags; UI cannot edit assignment/score | Add broader CRM editing after Phase 1 |
| Outreach pipeline | Existing lifecycle enum through LIVE plus terminal states | Growth migration/schema | | Yes | | Names differ from target lifecycle; no approved/active-subscriber stages | Extend nondestructively in a future pipeline migration |
| Transition history | Status-change activity type exists | `PawnShopLeadActivity` | | Yes | | Lead status updates do not automatically record transition activity | Add transactional transition recording in Phase 2 |
| Calls, emails, meetings, demos, notes | Activity enum/API supports call, email, meeting, note | Controller/schema | | Yes | | UI only creates NOTE | Expand UI operation choices safely in Phase 1 |
| Follow-up tasks | `nextFollowUpAt`, due summary, directory display | Controller/schema/pages | | Yes | | No completion state; list sorting uses `updatedAt` fallback | Treat as activity follow-ups in Phase 1; task model later |
| Prospect detail | Detail API and populated/loading/error UI | `GrowthLeadDetailPage.tsx` | Yes | | | Editing is limited | Reuse |
| Duplicate detection | No implemented matching workflow | — | | | Yes | Duplicate prospects possible | Phase 2 |
| Prospect-to-Shop conversion | Endpoint explicitly returns Phase 1 conflict | `convertGrowthLead` | | | Yes | Not functional by design | Phase 2 |
| Registration invitations | Beta invites exist separately, not linked to prospects | beta invite code | | | Yes | No prospect attribution | Phase 2 |
| Claim This Shop | No claim workflow | — | | | Yes | Ownership claims require dedicated security review | Phase 2 |
| CSV import | Import model exists; no operational import API/UI | `PawnShopLeadImport` | | Yes | | Dormant schema only | Phase 2 |
| Growth dashboard and conversion analytics | Funnel counts and due count | dashboard/controller | | Yes | | No rates, geography, cohorts, or hard metrics | Keep basic Phase 1 summary; expand later |
| Super Admin authorization | Entire router requires authenticated `SUPER_ADMIN` | `superAdmin.routes.js` | Yes | | | Frontend permissions are broad admin labels, but route guard is role-based | Preserve and add regression tests |
| Growth audit logging | Persisted middleware covers mutations | `superAdminAudit.service.js`, router | Yes | | | Target type is generic for growth paths | Improve classification without exposing bodies |
| Permanent shop QR | No marketing QR implementation | — | | | Yes | Owners cannot direct users to their storefront | Add one lazily provisioned default campaign per shop |
| Stable redirect and storefront destination | Existing storefront is `/shops/:id`; no short redirect | shop routes/App routes | | | Yes | QR visitors lack stable short URL and slug | Add unique shop slug plus constrained campaign short code |
| Campaign CRUD and activation | No model/API/UI | — | | | Yes | Duplicate architecture risk if added outside `PawnShop` | Add one tenant-scoped campaign model and owner API |
| Dynamic destinations | Existing public routes cover shops/items/auctions/intake | web routes | | Yes | | Arbitrary URLs would create open redirects | Store a destination type and validated internal resource id only |
| SVG / PNG QR output | No QR generation dependency | package manifests | | | Yes | Hand-built pseudo-QR would be unsafe/nonfunctional | Use a maintained QR dependency; SVG required, PNG only if supported |
| Basic scan analytics | No marketing scan model | — | | | Yes | Raw IP storage would create privacy risk | Store timestamp, coarse user-agent/referrer, and keyed IP hash only |
| Tenant isolation | Staff-access middleware exists for inventory/auctions | `staffAccess.middleware.js` | | Yes | | Marketing has no permission or shop scope yet | Add `marketing:read`/`marketing:write` enforcement and shop filters |
| Owner Marketing Center pages/navigation | No owner page or route | `App.tsx`, `SiteLayout.tsx` | | | Yes | Feature is unreachable | Add owner route, nav link, loading/error/empty/populated states |
| Public storefront details | Identity/contact/inventory are present | `ShopDetailPage.tsx`, shops controller | | Yes | | Uses IDs; limited brand/review/follow/policies support | Add slug resolution now; defer richer storefront work |
| Notification consent and saved searches | Notifications and saved searches exist | notification/saved-search code | | Yes | | Neither is permission for campaign marketing | Do not infer consent; Phase 4 retention must be opt-in |
| Printable and digital materials | No generators/publishing integrations | — | | | Yes | Must not claim integrations | Phase 3 |

## Phase 1 decision

Reuse all six Growth Center models and its routes/pages. Make only bounded improvements to activity/follow-up UI, navigation, audit classification, and authorization tests. Add the missing owner marketing foundation as shop-owned campaign and privacy-conscious scan records, a nullable unique shop slug, constrained internal destinations, stable public redirects, QR assets, owner pages, and isolation/security tests. No existing migration will be edited and no database will be applied or reset.
