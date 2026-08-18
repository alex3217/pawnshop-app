# Current-main accessibility and browser-launch evidence v1

## Decision and scope

**Release impact: CONDITIONAL.** Current main passed the fresh lint, TypeScript,
frontend unit/contract, route, role-route, static-safety, diff-integrity, and
fixture-backed browser checks that could be executed locally. The required bare
frontend build failed closed because no explicit deployed-build environment
contract was supplied. That is an environment/configuration limitation rather
than a reproduced application defect, but a successful build under the approved
release environment contract remains required before release certification.
Manual assistive-technology, staging, provider, and production checks also remain
outside this local evidence.

This report certifies only repository SHA
`9f1de9b68636fee00f5ca606a931fca5a4dadb41` as checked out from
`origin/main`. It does not certify production, authorize deployment, authorize
public launch, or make a production-readiness or legal-compliance claim.
Production was not contacted. Its reported maintenance-mode and disabled
automatic-deployment state were not changed or independently certified here.

Results must be refreshed after PR #330 and PR #315 land. Historical test claims
from other pull requests were not used as current evidence.

## Date, host, and tools

- Execution date: 2026-08-18 (CDT, America/Chicago); browser run began
  2026-08-18 07:54:49 CDT and completed in 9.0 minutes.
- Host: macOS Darwin 25.5.0, arm64.
- Branch: `audit/current-main-accessibility-launch-evidence-v1`.
- Node: `v20.20.2`.
- npm: `10.8.2`.
- TypeScript: `5.9.3`.
- Playwright: `1.62.0`.
- Locked dependencies were installed with `npm ci` at the repository root,
  `apps/web`, and `apps/api/backend`. Package manifests and lockfiles were not
  changed. npm reported five web dependency vulnerabilities (two moderate,
  three high) and three backend high-severity vulnerabilities; no audit fix was
  attempted because dependency changes were prohibited and vulnerability
  triage is outside this certification.

## Repository inspection and test safety

The package scripts, web TypeScript references, build launcher, four Playwright
configurations, release-candidate environment launcher, route-audit scripts,
frontend tests, and marketplace browser specs were inspected before execution.

The executed release-candidate configuration starts only a Vite server at
`http://127.0.0.1:5186`. Its launcher constructs a restricted child environment,
the Vite configuration disables environment files, browser-only test keys are
fixed locally, and applicable API/Stripe requests are fixture-fulfilled or
aborted by the tests. It does not start the backend, use real credentials, or
require a remote database, email provider, Render, Cloudflare, staging, or
production. The staging Playwright project was inspected but not run because it
loads staging origins and authenticated storage state.

## Fresh automated evidence

| Command | Result | Exact count or observation |
| --- | --- | --- |
| `npm --prefix apps/web run lint` | PASS | ESLint exited 0; no errors or warnings |
| `(cd apps/web && npm exec -- tsc -b --noEmit)` | PASS | Two referenced TypeScript projects checked; 0 diagnostics |
| `node --test apps/web/test/*.test.mjs` | PASS | 159 passed, 0 failed, 0 skipped, 0 cancelled, 0 todo |
| `npm --prefix apps/web run build` | FAIL, reproduced once | 0 builds passed, 1 command failed on each of two identical attempts; see limitation below |
| `npm run check:frontend-routes` | PASS | 1 audit passed; warnings identify dynamic routes that the static matcher cannot resolve exactly |
| `npm run check:role-routes` | PASS after locked dependency install | 44 check assertions passed across public, Buyer, Owner, Admin, negative-permission, and Super Admin routes |
| `npm run check:static-safety` | PASS | 6 guards passed, 0 failed |
| `git diff --check` | PASS | 0 whitespace errors |
| `npm exec -- playwright test --config=playwright.release-candidate.config.ts` (from `apps/web`) | PASS | 459 passed, 0 failed, 0 skipped, 0 flaky |

The role-route command initially could not start because the isolated checkout
lacked backend `node_modules` and its parser imports `bcryptjs`. After
`npm ci` in `apps/api/backend`, the identical command passed. No remote service
or database was used by that self-contained route smoke test.

The first Playwright launch attempt was blocked by the filesystem sandbox from
binding loopback (`listen EPERM ... 127.0.0.1:5186`). The identical command was
rerun with permission to bind the localhost-only server and then passed all 459
executions. This was an execution-environment limitation, not a test failure.

## Browser, project, and viewport matrix

| Project | Engine/device profile | Default viewport | Executed | Passed | Failed | Skipped |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| `chromium` | Desktop Chrome | 1280x720 | 267 | 267 | 0 | 0 |
| `firefox-critical` | Desktop Firefox | 1280x720 | 15 | 15 | 0 | 0 |
| `webkit-critical` | Desktop Safari | 1280x720 | 137 | 137 | 0 | 0 |
| `mobile-chromium` | Pixel 7 | 412x839 | 20 | 20 | 0 | 0 |
| `mobile-webkit` | iPhone 14 | 390x664 | 20 | 20 | 0 | 0 |
| **Total** |  |  | **459** | **459** | **0** | **0** |

Individual specs also set 1440x900, 1024x768, 768x1024, 667x375, 430x932,
412x915, 393x852, 390x844, 390x667, 375x667, 360x800, and 320x568 viewports,
plus desktop 200% zoom representatives. The matrix covered automated axe checks,
authentication landmarks and labels, keyboard traversal and visible focus,
focus traps/restoration, viewport gutters and overflow, computed contrast and
readability in light/dark themes, Buyer navigation/account routes, Owner
workspace and onboarding routes, Admin and Super Admin access, marketplace and
item detail, auctions, purchase/checkout/fulfillment, offers/watchlist controls,
payment-method layout and explicit consent, and the public-preview read-only
banner with disabled purchase actions.

## Failure and reproduction

The required command below failed twice with the same result:

```text
npm --prefix apps/web run build
Error: deployEnv must be preview, staging, or production for deployed builds.
```

Classification: **environment/configuration limitation and release follow-up**.
The build launcher intentionally fails closed without a complete explicit
environment contract. No environment or application configuration was changed
for this audit. Reproduce with the exact command above. Before release, rerun the
canonical build with the approved non-secret release environment contract and
record a successful artifact build. If it fails under that approved contract,
reclassify it as a launch blocker. No assertion, retry, timeout, application
code, or test code was changed.

No application defect was reproduced by the executed browser suite. No test
failure required the mandated same-configuration reproduction.

## Unexecuted and limited checks

- `playwright.staging.config.ts` and all `e2e-staging` tests: not run because
  staging access and real authenticated state were expressly prohibited.
- Marketplace-only and seller-subscription Playwright configurations: not run
  separately because their local coverage is contained within the broader
  release-candidate Chromium run; rerunning would duplicate evidence rather
  than broaden it.
- Reduced-motion browser behavior: application styles and a reduced-motion
  code path exist, but no automated Playwright assertion was found. It is not
  claimed as tested.
- Limited local visual inspection: none was performed. Automated computed-style,
  layout, contrast, viewport, and accessibility assertions are evidence; they
  are not represented as human visual approval.
- Generated Playwright HTML/JSON/results artifacts were local execution output
  only and are not part of this change.

## Remaining manual accessibility checks

- Keyboard-only end-to-end traversal on representative Buyer, Owner, Admin,
  Super Admin, marketplace, auction, offer, watchlist, and payment flows,
  including focus order, focus visibility, dialogs, errors, and escape behavior.
- Screen-reader checks with VoiceOver/Safari and NVDA or JAWS/Chrome, including
  landmarks, headings, names, status announcements, validation, tables, and
  live auction/payment updates.
- Browser/OS high-contrast and forced-colors modes, text spacing, text-only zoom,
  orientation changes, reflow at 400% where applicable, and touch target review.
- `prefers-reduced-motion: reduce` behavior for tours, scrolling, skeletons,
  dialogs, and other animated transitions.
- Human review of color meaning, reading order, alternative text quality,
  captions/instructions, cognitive clarity, and error recovery.

## Remaining staging checks

- Repeat the launch-critical browser matrix against the immutable candidate
  deployed to staging using approved test accounts for every role.
- Validate real routing, refresh/deep links, session expiry, role transitions,
  API error states, WebSocket updates, uploads/media delivery, and mobile devices.
- Complete manual assistive-technology and visual checks on the deployed
  candidate and confirm the deployed SHA and build artifact match the candidate.

## Remaining production and provider checks

- Independently verify the production SHA, maintenance mode, automatic-deploy
  containment, health/observability, rollback, backups, DNS/TLS/CDN behavior,
  and launch-control approvals without changing them in this task.
- Validate approved Stripe sandbox/provider behavior, webhook delivery and
  replay safety, payment-method consent, checkout, refunds/payouts, and failure
  recovery; validate email delivery and upload/media durability through their
  approved non-production paths.
- Resolve or formally disposition the dependency audit findings under the
  repository's security process.
- Re-run this certification after PR #330 and PR #315 integration, then complete
  staging and provider gates before any production or public-launch decision.

This evidence document changes no code, tests, schemas, workflows, packages,
lockfiles, environment configuration, provider state, deployment state, or test
behavior. It does not authorize deployment or public launch.
