# Master Pawn Shop Growth Center — Phase 1

## Purpose

The Growth Center is an internal Super Admin workspace for discovering, qualifying, and tracking prospective pawn shops before onboarding. Phase 1 provides the private system of record, manual CRUD workflows, source provenance, contact suppression, and follow-up tracking.

## Architecture

- Prisma models store leads, public business contacts, activities, source provenance, import job metadata, and suppressions.
- Express endpoints live under `/api/super-admin/growth/leads` and reuse the existing authentication, role guard, no-store policy, validation/error handling, and Super Admin mutation audit middleware.
- React pages live inside the existing `/super-admin` layout, client-side role guard, navigation, and authenticated API client.
- Deleting a lead is implemented as safe archival (`businessStatus = INACTIVE`); Phase 1 does not hard-delete lead history.

## Statuses

Business status progresses among `DISCOVERED`, `ACTIVE`, `INACTIVE`, and `CLOSED`. Verification uses `UNVERIFIED`, `PENDING`, `VERIFIED`, and `REJECTED`. Outreach uses `NOT_CONTACTED`, `CONTACTED`, `INTERESTED`, `DEMO_SCHEDULED`, `APPLICATION_STARTED`, `ONBOARDING`, `LIVE`, `DECLINED`, and `DO_NOT_CONTACT`.

## Permissions

Every backend route requires an authenticated `SUPER_ADMIN`; `ADMIN` and all owner/consumer roles are rejected. The client also guards direct URLs and shows Growth Center navigation only inside the Super Admin surface. Backend authorization remains the security boundary.

## Data privacy boundaries

Lead and contact data is never exposed from public routes. Contact records distinguish public business contacts from other research notes. API user relationships return only id, name, and email—never credentials, tokens, billing data, or unrelated user fields. A suppression sets both `doNotContact` and `DO_NOT_CONTACT` atomically and records an internal activity. Phase 1 performs no scraping, email, SMS, campaign sending, or external API calls.

## Future phases

Future work may add CSV/Excel import, approved government datasets, permitted website collection, duplicate detection, a claim-your-shop workflow, owner-authorized inventory imports, campaign management, and analytics. Each requires separate privacy, terms, authorization, and operational review before enablement.
