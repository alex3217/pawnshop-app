# Interactive readability remediation matrix

Audit baseline: `3d526de2ac5d877607bc20ecfbf957b3236d0792`

The opt-in Playwright audit covers 105 concrete routes in each light/dark and
desktop/tablet/mobile matrix. The first complete run visited 630 route/matrix
combinations, scanned 12,859 visible controls, exercised 50,958 interaction
states, and ran 630 Axe WCAG 2.1 A/AA scans. Findings are intentionally not
suppressed: the audit exits unsuccessfully and emits route, role, theme,
viewport, selector, accessible name, state, and measured contrast.

## P0 — unreadable interaction text

- **Resolved here:** `/buyer/sell-item` primary hero action inherited the
  global anchor hover foreground without a paired background. In light mode,
  “Find similar items” changed from white-on-navy (17.85:1) to navy-on-navy
  (1.00:1). Scoped paired hover/focus/active/disabled colors now keep it at
  8.72:1 or higher. “Browse marketplace” and “Refresh offers” share the
  permanent regression coverage.
- **Remaining batch:** 2,275 state observations across 61 routes are below
  4.5:1. The largest shared families are navigation dropdown triggers
  (`More`, `Buyer Tools`, `Owner Tools`), setup/tutorial controls, scroll-to-top,
  owner error retry actions, and consumer empty-state/action links. These need
  bounded shared-navigation, assistance-widget, owner-shell, and consumer
  workflow PRs rather than a single global anchor override.

## P1 — focus and accessible naming

- 2,126 focus-state observations across 60 routes are below the 3:1 focus
  indicator requirement. Shared navigation, compact footer links, setup/help
  controls, and page-local secondary actions account for most occurrences.
- Axe reported 68 color-contrast route observations and seven unnamed-select
  observations (`/buyer/item-locator` and `/super-admin/integrations`).
- The computed-name audit found no otherwise empty interactive names.

## P1 — target size and obstruction

- 40,019 state observations across 62 routes are below 44x44. Repetition is
  expected because shared navigation/footer targets appear on many routes and
  every enabled control is checked in four states. Remediation should start
  with shared mobile navigation, footer links, role badges, and owner-shell
  navigation, followed by page-local compact text actions.
- Twenty-eight state measurements on `/buyer/subscription` and
  `/account/payment-methods` could not be completed because controls rerendered
  during measurement; those payment surfaces require a dedicated stable
  fixture batch. One transparent-control observation was also recorded on the
  mocked payment-method surface.
- One horizontal-overflow observation remains on `/super-admin/auctions`.

## Recommended bounded follow-ups

1. Shared navigation, footer, scroll-to-top, and setup/tutorial controls.
2. Consumer dashboard, watchlist, bids/wins, marketplace empty states, and
   authentication password/legal actions.
3. Owner shell/navigation and error/retry states.
4. Payment/subscription fixtures plus payment-method interaction states.
5. Admin/super-admin form labels, focus treatment, and auction overflow.

Run the complete matrix with:

```sh
FULL_INTERACTION_READABILITY_AUDIT=1 \
READABILITY_AUDIT_REPORT=/tmp/readability-{matrix}.json \
npx playwright test e2e-marketplace/sitewide-interactive-readability-audit.spec.ts \
  --config playwright.marketplace.config.ts --workers=6
```
