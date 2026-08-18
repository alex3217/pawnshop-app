# Final current-main accessibility and frontend launch recertification

## Decision and scope

**Release impact: CONDITIONAL.** The local current-main frontend certification
passed every executed lint, TypeScript, unit/contract, production-contract build,
route, static-safety, managed-public-image, and fixture-backed browser check.
No application defect was reproduced. Manual assistive-technology review and
staging, provider, and production validation remain required before a launch
decision, so this local evidence alone is not an unconditional launch pass.

The application and test tree under certification is exact `origin/main` SHA
`ef0e55e91f3d960bd66b3960b5a23277318faeac`. It was integrated into
`audit/current-main-accessibility-launch-evidence-v1` with normal merge commit
`3f4f122` from the branch's pre-sync head
`f3420ec25325fe0220139ebd267e293886437b54`; no rebase or force-push was used.

This report does not certify production, authorize deployment, or authorize
public launch. Staging, production, providers, remote databases, and real
accounts were not contacted.

## Date, host, and tools

- Execution date: 2026-08-18 (CDT, America/Chicago); the browser matrix began
  2026-08-18 08:52:36 CDT and completed in 8.9 minutes.
- Host: macOS Darwin 25.5.0, arm64.
- Node: `v20.20.2`.
- npm: `10.8.2`.
- TypeScript: `5.9.3`.
- Playwright: `1.62.0`.
- Prisma Client generated locally for the focused service contract: `6.19.3`.
- Dependencies were freshly installed from existing root, web, and backend
  lockfiles with `npm ci`. No manifest or lockfile changed. npm reported five
  web dependency vulnerabilities (two moderate, three high) and three backend
  high-severity vulnerabilities; no dependency change or audit fix was made.

## Local-only safety boundary

The release-candidate browser configuration starts only Vite at
`http://127.0.0.1:5186`. Its launcher constructs a restricted child environment,
the dedicated Vite config disables environment files, and tests fixture-fulfill
or abort applicable API and Stripe URLs. It does not start a remote-backed API.
The production-contract build embeds the repository-mandated production origins
but performs a local compile only; it makes no request to those origins.

The staging Playwright configuration was inspected but not executed because it
loads staging origins and authenticated storage state. The managed-public-image
integration test was not executed because it requires a database; the focused
service contract provides local, database-free evidence instead.

## Fresh automated evidence

| Exact command | Result | Exact count or observation |
| --- | --- | --- |
| `npm ci` | PASS | Root lockfile installed; 0 vulnerabilities reported |
| `npm --prefix apps/web ci` | PASS | 231 packages installed; audit reported 2 moderate and 3 high findings |
| `npm --prefix apps/api/backend ci` | PASS | 271 packages installed; audit reported 3 high findings |
| `npm --prefix apps/web run lint` | PASS | ESLint exited 0; 0 errors and 0 warnings |
| `(cd apps/web && npm exec -- tsc -b --noEmit)` | PASS | Two referenced TypeScript projects; 0 diagnostics |
| `node --test apps/web/test/*.test.mjs` | PASS | 162 passed, 0 failed, 0 skipped, 0 cancelled, 0 todo |
| `env VITE_DEPLOY_ENV=production VITE_API_ORIGIN=https://api.pawnloop.com VITE_API_BASE=/api VITE_SOCKET_URL=https://api.pawnloop.com VITE_SOCKET_PATH=/socket.io GITHUB_SHA=ef0e55e91f3d960bd66b3960b5a23277318faeac npm run build:web` | PASS | 318 modules transformed; production bundle and SHA-bound `release.json` emitted; one non-fatal >500 kB chunk warning |
| `npm run check:frontend-routes` | PASS | 1 audit passed; dynamic-route warnings are informational limitations of the static matcher |
| `npm run check:role-routes` | PASS | 44 self-contained assertions across public, Buyer, Owner, Admin, negative-permission, and Super Admin routes |
| `npm run check:static-safety` | PASS | 6 guards passed, 0 failed |
| `git diff --check` | PASS | 0 whitespace errors |
| `(cd apps/api/backend && npm exec -- prisma generate)` | PASS | Prisma Client 6.19.3 generated locally; no database contacted |
| `node --test apps/api/backend/test/managedPublicListingImages.service.test.js` | PASS after client generation | 7 passed, 0 failed, 0 skipped, 0 cancelled, 0 todo |
| `(cd apps/web && npm exec -- playwright test --config=playwright.release-candidate.config.ts --list)` | PASS | 459 tests in 39 files discovered |
| `(cd apps/web && npm exec -- playwright test --config=playwright.release-candidate.config.ts)` | PASS | 459 passed, 0 failed, 0 skipped, 0 flaky |

The production-contract build is fresh evidence from the exact pinned main SHA.
It replaces the earlier pre-sync bare-build limitation: the canonical explicit
Production contract and immutable revision were supplied, and the build passed.

The focused managed-public-image test initially failed before registering its
seven subtests because `npm ci` does not generate Prisma Client. Classification:
**local test prerequisite**, not an application defect. After the repository's
normal `prisma generate` step, the identical test command passed 7/7. Reproduce
the prerequisite failure by running the test immediately after backend
`npm ci`; reproduce the passing evidence by generating Prisma Client first.

## Browser, project, and viewport matrix

| Project | Engine/device profile | Default viewport | Executed | Passed | Failed | Skipped |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| `chromium` | Desktop Chrome | 1280x720 | 267 | 267 | 0 | 0 |
| `firefox-critical` | Desktop Firefox | 1280x720 | 15 | 15 | 0 | 0 |
| `webkit-critical` | Desktop Safari | 1280x720 | 137 | 137 | 0 | 0 |
| `mobile-chromium` | Pixel 7 | 412x839 | 20 | 20 | 0 | 0 |
| `mobile-webkit` | iPhone 14 | 390x664 | 20 | 20 | 0 | 0 |
| **Total** |  |  | **459** | **459** | **0** | **0** |

Individual tests also exercise 1440x900, 1024x768, 768x1024, 667x375,
430x932, 412x915, 393x852, 390x844, 390x667, 375x667, 360x800, and
320x568 viewports plus desktop 200% zoom representatives.

The fresh matrix covers automated axe checks, authentication landmarks and
labels, keyboard traversal and visible focus, focus traps/restoration, viewport
gutters and overflow, computed contrast/readability in light and dark themes,
public-preview read-only banners and disabled purchase controls, Buyer account
routes, Owner workspaces, Admin and Super Admin isolation, marketplace/item
detail, auctions, bids/offers/watchlist-related controls, payments, consent,
checkout, and fulfillment. The strengthened route-protection test explicitly
verifies that an Admin cannot render `/super-admin/shops/shop-one/manage`; it
passed in Chromium, Firefox critical, and WebKit critical coverage. Persisted
public listing images and their fallbacks passed in Chromium and WebKit critical.

The separate 7-test managed-media service contract passed acceptance of attached,
shop-owned item images and rejection of arbitrary external, cross-shop,
wrong-item, wrong-lifecycle, deleted, temporary, incomplete, cleanup-pending,
wrong-kind, expired, and mixed public image collections. Draft and non-public
listing behavior remained usable. Database-backed publication integration was
not claimed.

## Failures and limitations

- No lint, TypeScript, frontend test, production-contract build, route, safety,
  managed-image assertion, or browser assertion failed after prerequisites.
- The Prisma initialization failure described above was reproduced by the
  initial focused-test invocation and resolved only by generating the client;
  no assertion, timeout, retry, application code, or test code changed.
- The build emitted one non-fatal chunk-size warning for a 519.44 kB minified
  JavaScript chunk. This is a performance follow-up, not a build failure.
- Reduced-motion styles and code paths exist, but no dedicated automated
  reduced-motion browser assertion was found. Reduced motion is not claimed as
  manually certified.
- No human visual inspection or assistive-technology session was performed.
  Automated layout, computed-style, contrast, viewport, and axe assertions are
  not represented as manual approval.
- Generated build and Playwright artifacts are local ignored output only and
  are not included in the pull request.

## Remaining manual accessibility work

- Keyboard-only end-to-end traversal across representative Buyer, Owner, Admin,
  Super Admin shop management, marketplace, auction, offer, watchlist, and
  payment flows, including focus order, dialogs, errors, and escape behavior.
- VoiceOver/Safari and NVDA or JAWS/Chrome checks for landmarks, headings, names,
  status announcements, validation, tables, media alternatives, and live
  auction/payment changes.
- High-contrast and forced-colors modes, text spacing, text-only zoom, 400%
  reflow where applicable, orientation changes, and physical touch targets.
- `prefers-reduced-motion: reduce` review for tours, scrolling, skeletons,
  dialogs, and transitions.
- Human review of color meaning, reading order, alternative-text quality,
  cognitive clarity, instructions, and error recovery.

## Remaining staging, provider, and production work

- Re-run the launch-critical matrix against an immutable staging candidate with
  approved test accounts; verify deployed SHA/artifact identity, refresh and
  deep links, session expiry, API failures, sockets, uploads/media delivery,
  and representative physical mobile devices.
- Exercise managed-public-media publication with a disposable local or staging
  database and approved object storage; confirm upload durability, tenant
  isolation, legacy-image readability, cleanup, and failure recovery.
- Validate approved Stripe sandbox behavior, webhooks, consent, checkout,
  refunds/payouts, and recovery; validate email delivery through an approved
  non-production provider path.
- Independently verify production SHA, maintenance mode, automatic-deploy
  containment, health/observability, rollback, backups, DNS/TLS/CDN behavior,
  provider readiness, security findings, and launch approvals.

This evidence document changes no application or test behavior, schema,
migration, workflow, package, lockfile, environment configuration, provider
state, database, or deployment state. It does not authorize deployment or
public launch.
