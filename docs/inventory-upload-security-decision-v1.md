# Inventory CSV upload security decision

The inventory import remains a CSV-only workflow. This change adds authenticated distributed rate limiting, bounded request concurrency, strict type and structure checks, explicit resource ceilings, and bounded error retention.

No malware-scanning provider is added and no provider credentials are requested. CSV input is treated as non-executable plain text, rejects NUL bytes, and is never persisted as an uploaded asset. Introducing a provider would expand external data processing and credential scope without a current executable-file use case. Any future support for binary or persisted imports requires a separate provider, privacy, retention, and credential review.
