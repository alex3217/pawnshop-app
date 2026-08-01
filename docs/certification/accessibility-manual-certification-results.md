# Accessibility Manual Certification Results

Certification date: 2026-08-01 (America/Chicago)  
Overall result: **PARTIAL / MANUAL CERTIFICATION BLOCKED**

Automated supporting evidence passed: `npm --prefix apps/web run test:axe` completed 26/26 Chromium checks across critical routes in desktop/light and mobile/dark profiles, including Launch War Room access/evidence checks.

| Manual requirement | Result | Evidence needed |
|---|---|---|
| Keyboard-only order, operation, and visible focus | BLOCKED | Named tester, route/state, browser/OS, screenshots |
| 200% and 400% zoom/reflow | BLOCKED | Viewport and route/state records |
| Reduced motion | BLOCKED | OS/browser setting and observed behavior |
| VoiceOver | BLOCKED | macOS/browser/AT versions and findings |
| NVDA | BLOCKED | Windows/browser/AT versions and findings |
| Form-error association | BLOCKED | Manual announcement/focus evidence |
| Table/chart alternatives | BLOCKED | Route-by-route manual results |
| Measured color contrast | BLOCKED | Recorded foreground/background values and ratios |
| Loading, empty, populated, error, access, upgrade, unavailable states | BLOCKED | Complete state matrix |

Preparation checklist: record tester, timestamp, OS, browser, assistive technology/version, route, viewport, theme, state, expected result, observed result, artifact path, issue/fix, and retest. Automated axe success is not a WCAG 2.2 AA certification.
