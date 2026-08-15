# Release-candidate QA and accessibility evidence

This workstream is test-only unless a narrowly owned accessibility defect can be
reproduced and fixed without overlapping another open pull request. It never
connects to a deployed environment, provider, payment service, or database.

## Hermetic environment contract

The Playwright web server starts through `start-release-candidate-server.mjs`.
That launcher constructs a new child environment from a small system allowlist;
it does not spread `process.env`. Fixed browser-only values point API and socket
traffic at loopback. Both API path aliases are `/api`. The dedicated Vite config
sets `envFile: false`, so developer `.env`, `.env.local`, and mode-specific files
cannot alter release-candidate browser evidence.

The production Vite and backend startup paths are unchanged. Backend startup
currently loads `.env.<APP_ENV>` followed by `.env` with `override: false`; this
is documented rather than changed because release-candidate tests do not launch
the backend and backend runtime changes are outside this narrow test launcher.

## Evidence matrix

| Project | Selection | CI split | Viewport |
| --- | --- | --- | --- |
| `chromium` | Complete 231-test / 37-file marketplace suite at branch creation | Four shards | Desktop Chrome |
| `firefox-critical` | Stable auth, navigation, checkout, route and accessibility specs | One job | Desktop Firefox |
| `webkit-critical` | Stable auth, navigation, checkout, route and accessibility specs | One job | Desktop Safari |
| `mobile-chromium` | Layout/readability/map representatives | One job | Pixel 7 |
| `mobile-webkit` | Layout/readability/map representatives | One job | iPhone 14 |

Each failure retains an HTML report, JSON results, screenshot, trace, and video
under `apps/web/.playwright`; GitHub uploads that directory for 14 days. Jobs use
strict failure behavior and do not contact staging or production.

## Accessibility scope and ownership

The repository already includes `@axe-core/playwright`; no dependency change is
needed. The release-candidate accessibility spec checks stable authentication
pages for serious/critical WCAG 2/2.1 A/AA violations plus deterministic labels,
names, traversal, and visible focus. Existing shared layout, payment-method,
inventory, upload, and release-control files are owned by active PRs and remain
untouched. Additional UI fixes must wait until overlapping ownership clears or a
defect is reproduced in an unowned file.
