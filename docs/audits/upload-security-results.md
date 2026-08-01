# Upload Security Results

## Decision: FAIL

The mounted backend upload capability found is `/api/inventory-bulk/import`: authenticated OWNER/ADMIN, Multer in-memory storage, and a 2 MiB size cap. The controller checks ownership by `shopId` and creates inventory rows from parsed CSV.

Critical gaps:

- No Multer `fileFilter`, MIME allowlist, magic-byte/content-signature validation, or explicit unsupported-type contract.
- CSV parser behavior is used as content validation; row count, field length, formula injection, memory/CPU, and transactional partial-import limits are not evidenced.
- Original filename is retained as metadata without a documented normalization/redaction policy.
- No malware scan, image decode, decompression-bomb protection, EXIF stripping, quota, failed-upload cleanup, or deletion lifecycle.
- No durable object storage, signed access, private authorization, cross-shop object tests, retention, or orphan cleanup.
- Web code references `/uploads`, but no general image/document upload router was found mounted. This blocks photos/documents and makes production readiness claims invalid.

The in-memory CSV buffer is not durable and normally disappears after request handling, which limits orphaned binary persistence but does not resolve resource exhaustion or import-record cleanup. Production uploads must remain disabled until an authorized object-storage design and adversarial isolated tests cover every required control.

