# Dependency Remediation Plan

## Decision: FAIL

Read-only command: `npm audit --omit=dev --audit-level=low`. No fix or upgrade command was run.

| Tree | Result | Launch treatment |
|---|---|---|
| Root | PASS: 0 | Recheck in CI from lockfile |
| Backend | PASS: 0 | Recheck in CI from lockfile |
| Web | FAIL: 2 moderate | React Router open-redirect/backslash bypass and SSR hydration constructor injection affect installed `react-router`/`react-router-dom`; audit proposes a breaking 7.18.2 upgrade. Review reachability (SPA navigation vs SSR hydration), upgrade through the official v6-to-v7 path, and regress auth redirects, nested routes, query strings, back/forward navigation, and every critical flow. Until upgraded, reject external/backslash navigation inputs server-side and avoid deserializing untrusted SSR errors. |
| Mobile | FAIL: 19 (1 low, 12 moderate, 5 high, 1 critical) | Advisories include `shell-quote` critical; high issues in `@xmldom/xmldom`, `brace-expansion`, `js-yaml`, `postcss`, and `ws`; moderate `uuid` plus transitive Expo tooling. Run Expo-supported dependency alignment, verify which paths are build-time/dev vs runtime, and test iOS/Android builds, Metro, prebuild/config plugins, manifests, splash screen, source maps, XML/YAML handling, websocket tooling, and OTA/update flows. Do not force-upgrade. |

Mobile launch stays deferred until the supported Expo tree resolves or formally risk-accepts reachable advisories. Web public launch stays blocked until the React Router upgrade/mitigation and full route regression are reviewed.

