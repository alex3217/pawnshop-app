# Browser Critical-Flow Results

## Decision: PASS (mock) / BLOCKED (staging)

The web production build passes. The mock-backed Playwright suite was started with `npx playwright test --config playwright.marketplace.config.ts` (74 tests, Chromium, loopback Vite, test publishable placeholder).

Remediation result on 2026-08-01:

- Root cause was a catch-all customer-scan mock returning an invalid notification collection; `NotificationCenter` then crashed the React tree. The service now safely treats malformed notification collections as empty and the mock returns the real contract.
- Customer-scan regression: PASS 4/4 with original workflow assertions.
- Final complete mock suite: PASS 100/100 (74 existing browser checks plus 26 axe/War Room checks), Chromium, loopback Vite, mock-only APIs and Stripe placeholder.

No deployed staging backend or certified seeded database was available, so public, buyer, owner, staff, admin, and Super Admin populated/error/unauthorized/forbidden/plan-limited/mobile-width flows remain BLOCKED. Static frontend and backend route audits exited 0, but the frontend audit emitted many potential links without exact static route matches; static enumeration is not browser proof.

Required next run: run the full role/page matrix against isolated staging at phone/tablet/desktop widths and retain screenshots/traces for loading, empty, populated, error, unauthorized, forbidden, and upgrade states.
