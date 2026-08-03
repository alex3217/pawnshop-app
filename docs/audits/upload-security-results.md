# Upload Security Results

## Decision: PARTIAL

The mounted `/api/inventory-bulk/import` boundary is authenticated OWNER/ADMIN, rate-limited, ownership-scoped, in-memory, and capped at 2 MiB. It now validates extension/MIME, binary content, fatal UTF-8 decoding, headers, 1,000 rows, 2,000-character fields, formula prefixes, safe filenames, and every row before transactionally creating the job/items. Focused safeguards pass 7/7.

Remaining gaps:

- No malware scan, image decode, decompression-bomb protection, EXIF stripping, quota, failed-upload cleanup, or deletion lifecycle.
- No durable object storage, signed access, private authorization, cross-shop object tests, retention, or orphan cleanup.
- Web code references `/uploads`, but no general image/document upload router was found mounted. This blocks photos/documents and makes production readiness claims invalid.

General production uploads must remain disabled until the documented private object-storage architecture and adversarial isolated tests cover every required control. CSV cross-shop behavior is enforced by owner-scoped lookup but still needs a database-backed integration test on a certified target.
