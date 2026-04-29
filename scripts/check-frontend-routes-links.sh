#!/usr/bin/env bash
set -euo pipefail

echo ""
echo "Scanning frontend routes and links..."

TMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TMP_DIR"' EXIT

ROUTES_FILE="$TMP_DIR/routes.txt"
LINKS_FILE="$TMP_DIR/links.txt"
NAVS_FILE="$TMP_DIR/navs.txt"
SERVICE_PATHS_FILE="$TMP_DIR/service-paths.txt"

grep -RhoE 'path=["'\''][^"'\'' ]+["'\'']' apps/web/src \
  --include="*.tsx" \
  --include="*.ts" \
  --include="*.jsx" \
  --include="*.js" \
  | sed -E 's/^path=["'\'']//; s/["'\'']$//' \
  | sort -u > "$ROUTES_FILE" || true

grep -RhoE 'to=["'\''][^"'\'' ]+["'\'']' apps/web/src \
  --include="*.tsx" \
  --include="*.ts" \
  --include="*.jsx" \
  --include="*.js" \
  | sed -E 's/^to=["'\'']//; s/["'\'']$//' \
  | grep '^/' \
  | sort -u > "$LINKS_FILE" || true

grep -RhoE 'navigate\(["'\''][^"'\'' ]+["'\'']' apps/web/src \
  --include="*.tsx" \
  --include="*.ts" \
  --include="*.jsx" \
  --include="*.js" \
  | sed -E 's/^navigate\(["'\'']//; s/["'\'']$//' \
  | grep '^/' \
  | sort -u > "$NAVS_FILE" || true

grep -RhoE '["'\'']/(api/)?[a-zA-Z0-9_./:{}?&=-]+["'\'']' apps/web/src/services apps/web/src/admin \
  --include="*.tsx" \
  --include="*.ts" \
  --include="*.jsx" \
  --include="*.js" \
  | sed -E 's/^["'\'']//; s/["'\'']$//' \
  | grep -v '^//:' \
  | sort -u > "$SERVICE_PATHS_FILE" || true

echo ""
echo "Frontend route declarations:"
cat "$ROUTES_FILE" || true

echo ""
echo "Frontend <Link to> destinations:"
cat "$LINKS_FILE" || true

echo ""
echo "Frontend navigate(...) destinations:"
cat "$NAVS_FILE" || true

echo ""
echo "Frontend service/admin API path strings:"
cat "$SERVICE_PATHS_FILE" || true

echo ""
echo "Potential page links without exact static route match:"
python3 - "$ROUTES_FILE" "$LINKS_FILE" <<'PY'
import re
import sys
from pathlib import Path

routes_file = Path(sys.argv[1])
links_file = Path(sys.argv[2])

routes = [line.strip() for line in routes_file.read_text().splitlines() if line.strip()]
links = [line.strip() for line in links_file.read_text().splitlines() if line.strip()]

def route_to_regex(route: str) -> re.Pattern:
    if route == "*":
        return re.compile(r"^\b\B$")

    escaped = re.escape(route)
    escaped = re.sub(r"\\:([A-Za-z0-9_]+)", r"[^/]+", escaped)
    return re.compile("^" + escaped + "$")

compiled = [(route, route_to_regex(route)) for route in routes]

warnings = []
for link in links:
    if link in routes:
        continue

    matched = any(pattern.match(link) for _, pattern in compiled)
    if not matched:
        warnings.append(link)

if warnings:
    for link in warnings:
        print(f"⚠️  {link}")
else:
    print("✅ No obvious unmatched static links found.")
PY

echo ""
echo "✅ Frontend route/link audit completed."
