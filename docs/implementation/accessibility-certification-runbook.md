# Accessibility Certification Runbook

Automated foundation: `npm --prefix apps/web run test:axe` covers critical routes at desktop/light and mobile/dark. It blocks serious and critical axe findings. Traces are retained on failure.

Before certification, also complete keyboard-only navigation, visible focus, zoom/reflow at 200% and 400%, reduced motion, VoiceOver and NVDA passes, accessible form-error association, table/chart alternatives, and measured contrast for normal, large, disabled, placeholder, status, and focus colors. Exercise loading, empty, populated, error, access-required, plan-upgrade, and unavailable states.

Record browser, OS, assistive technology version, route, viewport, theme, tester, finding, screenshot/trace, fix, and retest. Axe success alone is not a WCAG 2.2 AA claim.
