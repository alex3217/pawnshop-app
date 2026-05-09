// File: apps/api/backend/src/services/integrationCrypto.service.js

import crypto from "node:crypto";

const ALGORITHM = "aes-256-gcm";
const IV_BYTES = 12;

function normalizeString(value) {
  return String(value || "").trim();
}

function getSecretMaterial() {
  return (
    normalizeString(process.env.INTEGRATION_CREDENTIAL_ENCRYPTION_KEY) ||
    normalizeString(process.env.AUTH_SECRET) ||
    normalizeString(process.env.JWT_SECRET) ||
    normalizeString(process.env.ACCESS_TOKEN_SECRET) ||
    normalizeString(process.env.JWT_ACCESS_SECRET)
  );
}

function getKey() {
  const secret = getSecretMaterial();

  if (!secret) {
    throw new Error(
      "INTEGRATION_CREDENTIAL_ENCRYPTION_KEY or auth secret is required for integration credentials.",
    );
  }

  return crypto.createHash("sha256").update(secret).digest();
}

function cleanCredentialValue(value) {
  const next = normalizeString(value);
  return next || undefined;
}

export function getCredentialInput(body = {}) {
  const credentials = {
    apiKey: cleanCredentialValue(body.apiKey),
    bearerToken: cleanCredentialValue(body.bearerToken),
    webhookSecret: cleanCredentialValue(body.webhookSecret),
    basicUsername: cleanCredentialValue(body.basicUsername),
    basicPassword: cleanCredentialValue(body.basicPassword),
    customHeaderName: cleanCredentialValue(body.customHeaderName),
    customHeaderValue: cleanCredentialValue(body.customHeaderValue),
  };

  return Object.fromEntries(
    Object.entries(credentials).filter(([, value]) => Boolean(value)),
  );
}

export function hasCredentialInput(credentials = {}) {
  return Object.values(credentials).some((value) => Boolean(normalizeString(value)));
}

export function maskCredential(value) {
  const raw = normalizeString(value);
  if (!raw) return null;
  if (raw.length <= 4) return "••••";
  return `••••${raw.slice(-4)}`;
}

export function buildCredentialHint(credentials = {}) {
  return (
    maskCredential(credentials.apiKey) ||
    maskCredential(credentials.bearerToken) ||
    maskCredential(credentials.webhookSecret) ||
    maskCredential(credentials.customHeaderValue) ||
    maskCredential(credentials.basicPassword) ||
    null
  );
}

export function encryptIntegrationCredentials(credentials = {}) {
  if (!hasCredentialInput(credentials)) return null;

  const iv = crypto.randomBytes(IV_BYTES);
  const cipher = crypto.createCipheriv(ALGORITHM, getKey(), iv);

  const plaintext = JSON.stringify(credentials);
  const ciphertext = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);

  const tag = cipher.getAuthTag();

  return {
    v: 1,
    alg: ALGORITHM,
    iv: iv.toString("base64"),
    tag: tag.toString("base64"),
    ciphertext: ciphertext.toString("base64"),
    createdAt: new Date().toISOString(),
  };
}

export function decryptIntegrationCredentials(payload) {
  if (!payload || typeof payload !== "object") return {};
  if (!payload.iv || !payload.tag || !payload.ciphertext) return {};

  const decipher = crypto.createDecipheriv(
    ALGORITHM,
    getKey(),
    Buffer.from(String(payload.iv), "base64"),
  );

  decipher.setAuthTag(Buffer.from(String(payload.tag), "base64"));

  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(String(payload.ciphertext), "base64")),
    decipher.final(),
  ]);

  const parsed = JSON.parse(decrypted.toString("utf8"));
  return parsed && typeof parsed === "object" ? parsed : {};
}

export function scrubIntegrationMetadata(metadata) {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return metadata || null;
  }

  const blockedKeys = new Set([
    "apiKey",
    "api_key",
    "apiKeyValue",
    "bearerToken",
    "bearer_token",
    "token",
    "secret",
    "webhookSecret",
    "password",
    "basicPassword",
    "customHeaderValue",
  ]);

  const clean = {};

  for (const [key, value] of Object.entries(metadata)) {
    if (blockedKeys.has(key)) continue;
    clean[key] = value;
  }

  return Object.keys(clean).length ? clean : null;
}
