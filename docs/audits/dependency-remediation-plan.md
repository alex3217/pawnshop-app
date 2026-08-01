# Dependency Remediation Plan

## Decision: FAIL

Read-only command: `npm audit --omit=dev --audit-level=low`. No fix or upgrade command was run.

| Tree | Result | Launch treatment |
|---|---|---|
| Root | PASS: 0 | Recheck in CI from lockfile |
| Backend | PASS: 0 | Recheck in CI from lockfile |
| Web | FAIL: 2 moderate | Read-only recheck on 2026-08-01 confirms `react-router-dom` 6.30.4. Advisory ranges include v6 and npm offers only semver-major 7.18.2; no safe patched v6 exists. This SPA does not use React Router SSR hydration, reducing reachability of the constructor-injection path, but Link/navigation inputs still require review. Major upgrade is deferred pending official v6-to-v7 migration, future-flag adoption, and full auth/nested/query/history/lazy/404/protected/admin regression. No force fix was run. |
| Mobile | FAIL: 19 (1 low, 12 moderate, 5 high, 1 critical) | Advisories include `shell-quote` critical; high issues in `@xmldom/xmldom`, `brace-expansion`, `js-yaml`, `postcss`, and `ws`; moderate `uuid` plus transitive Expo tooling. Run Expo-supported dependency alignment, verify which paths are build-time/dev vs runtime, and test iOS/Android builds, Metro, prebuild/config plugins, manifests, splash screen, source maps, XML/YAML handling, websocket tooling, and OTA/update flows. Do not force-upgrade. |

Mobile launch stays deferred until the supported Expo tree resolves or formally risk-accepts reachable advisories. Web public launch stays blocked until the React Router upgrade/mitigation and full route regression are reviewed.
