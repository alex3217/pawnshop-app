#!/usr/bin/env bash
set -euo pipefail

echo "Applying PawnLoop Marketplace branding/domain update..."

python3 - <<'PY'
from pathlib import Path
import json
import re

ROOT = Path(".")

BRAND_NAME = "PawnLoop"
PRODUCT_NAME = "PawnLoop Marketplace"
FRONTEND_URL = "https://pawnloop.com"
WWW_URL = "https://www.pawnloop.com"
API_URL = "https://api.pawnloop.com"

# Safe text replacements only. Do not rename Prisma model names, code identifiers,
# database tables, route names, or repo folder names.
replacements = {
    "PawnShop App": PRODUCT_NAME,
    "Pawnshop App": PRODUCT_NAME,
    "Pawn Shop App": PRODUCT_NAME,
    "PawnShop Marketplace": PRODUCT_NAME,
    "Pawnshop Marketplace": PRODUCT_NAME,
    "Pawn Shop Marketplace": PRODUCT_NAME,
    "pawnshop-api": "pawnloop-api",
    "PawnShop API": "PawnLoop API",
    "Pawnshop API": "PawnLoop API",
}

safe_suffixes = {
    ".md",
    ".html",
    ".json",
    ".env.example",
    ".ts",
    ".tsx",
    ".js",
    ".jsx",
    ".css",
}

skip_dirs = {
    ".git",
    "node_modules",
    "dist",
    "build",
    "coverage",
    "backups",
}

def should_skip(path: Path) -> bool:
    parts = set(path.parts)
    if parts & skip_dirs:
        return True

    # Do not mass-change backend Prisma/model/controller identifiers.
    protected_parts = {
        "prisma",
        "models",
    }

    if "apps" in path.parts and "api" in path.parts and "backend" in path.parts:
        if parts & protected_parts:
            return True

    return False

def is_safe_file(path: Path) -> bool:
    name = path.name
    suffix = path.suffix

    if name.endswith(".env.example"):
        return True

    return suffix in safe_suffixes

changed = []

for path in ROOT.rglob("*"):
    if not path.is_file():
        continue
    if should_skip(path):
        continue
    if not is_safe_file(path):
        continue

    try:
        text = path.read_text()
    except UnicodeDecodeError:
        continue

    original = text

    for old, new in replacements.items():
        text = text.replace(old, new)

    if text != original:
        path.write_text(text)
        changed.append(str(path))

# Update backend env example defaults.
backend_env = Path("apps/api/backend/.env.example")
if backend_env.exists():
    text = backend_env.read_text()

    def set_env(text: str, key: str, value: str) -> str:
        pattern = re.compile(rf"^{re.escape(key)}=.*$", re.MULTILINE)
        line = f"{key}={value}"
        if pattern.search(text):
            return pattern.sub(line, text)
        return text.rstrip() + f"\n{line}\n"

    text = set_env(text, "APP_NAME", "pawnloop-api")
    text = set_env(text, "FRONTEND_URL", FRONTEND_URL)
    text = set_env(text, "WEB_URL", FRONTEND_URL)
    text = set_env(text, "CORS_ORIGIN", FRONTEND_URL)
    text = set_env(text, "CORS_ORIGINS", f"{FRONTEND_URL},{WWW_URL}")
    backend_env.write_text(text)
    changed.append(str(backend_env))

# Update web env example defaults.
web_env = Path("apps/web/.env.example")
if web_env.exists():
    text = web_env.read_text()

    def set_env(text: str, key: str, value: str) -> str:
        pattern = re.compile(rf"^{re.escape(key)}=.*$", re.MULTILINE)
        line = f"{key}={value}"
        if pattern.search(text):
            return pattern.sub(line, text)
        return text.rstrip() + f"\n{line}\n"

    text = set_env(text, "VITE_API_ORIGIN", API_URL)
    text = set_env(text, "VITE_API_BASE", "/api")
    text = set_env(text, "VITE_API_BASE_URL", "/api")
    text = set_env(text, "VITE_SOCKET_URL", API_URL)
    text = set_env(text, "VITE_SOCKET_PATH", "/socket.io")
    web_env.write_text(text)
    changed.append(str(web_env))

# Update local production env if present. This file is ignored and should not be committed.
prod_env = Path("apps/api/backend/.env.production")
if prod_env.exists():
    text = prod_env.read_text()

    def set_env(text: str, key: str, value: str) -> str:
        pattern = re.compile(rf"^{re.escape(key)}=.*$", re.MULTILINE)
        line = f"{key}={value}"
        if pattern.search(text):
            return pattern.sub(line, text)
        return text.rstrip() + f"\n{line}\n"

    text = set_env(text, "APP_NAME", "pawnloop-api")
    text = set_env(text, "FRONTEND_URL", FRONTEND_URL)
    text = set_env(text, "WEB_URL", FRONTEND_URL)
    text = set_env(text, "CORS_ORIGIN", FRONTEND_URL)
    text = set_env(text, "CORS_ORIGINS", f"{FRONTEND_URL},{WWW_URL}")
    prod_env.write_text(text)
    print("Updated local apps/api/backend/.env.production domain values. Do not commit this file.")

# Update web production env if present. This file is ignored and should not be committed.
web_prod_env = Path("apps/web/.env.production")
if web_prod_env.exists():
    text = web_prod_env.read_text()

    def set_env(text: str, key: str, value: str) -> str:
        pattern = re.compile(rf"^{re.escape(key)}=.*$", re.MULTILINE)
        line = f"{key}={value}"
        if pattern.search(text):
            return pattern.sub(line, text)
        return text.rstrip() + f"\n{line}\n"

    text = set_env(text, "VITE_API_ORIGIN", API_URL)
    text = set_env(text, "VITE_API_BASE", "/api")
    text = set_env(text, "VITE_API_BASE_URL", "/api")
    text = set_env(text, "VITE_SOCKET_URL", API_URL)
    text = set_env(text, "VITE_SOCKET_PATH", "/socket.io")
    web_prod_env.write_text(text)
    print("Updated local apps/web/.env.production domain values. Do not commit this file.")

# Update DEPLOYMENT.md domain examples.
deployment = Path("DEPLOYMENT.md")
if deployment.exists():
    text = deployment.read_text()
    text = text.replace("https://yourdomain.com", FRONTEND_URL)
    text = text.replace("https://api.yourdomain.com", API_URL)
    text = text.replace("yourdomain.com", "pawnloop.com")
    text = text.replace("api.yourdomain.com", "api.pawnloop.com")
    text = text.replace("PawnShop App", PRODUCT_NAME)
    text = text.replace("Pawnshop App", PRODUCT_NAME)
    deployment.write_text(text)
    changed.append(str(deployment))

print("Changed files:")
for item in sorted(set(changed)):
    print(f"- {item}")
PY

echo "PawnLoop branding/domain update complete."
