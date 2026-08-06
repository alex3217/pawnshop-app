import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { expect, type Page } from "@playwright/test";

import { stagingApiOrigin } from "./staging-origins";

const FIXTURES_DIR = dirname(fileURLToPath(import.meta.url));

export const buyerStorageStatePath = join(
  FIXTURES_DIR,
  "..",
  ".auth",
  "buyer.json",
);

export function requireBuyerCredentials() {
  const missing = ["BUYER_EMAIL", "BUYER_PASSWORD"].filter(
    (name) => !String(process.env[name] || "").trim(),
  );

  if (missing.length) {
    throw new Error(`Missing required staging credential variable(s): ${missing.join(", ")}`);
  }

  return {
    email: String(process.env.BUYER_EMAIL),
    password: String(process.env.BUYER_PASSWORD),
  };
}

export async function performBuyerLogin(page: Page) {
  const credentials = requireBuyerCredentials();

  await page.goto("/login?next=/buyer/dashboard", {
    waitUntil: "domcontentloaded",
  });
  await page.getByLabel("Email address").fill(credentials.email);
  await page.getByLabel("Password").fill(credentials.password);
  await page.getByRole("button", { name: /sign in/i }).click();

  await expect(page).toHaveURL(/\/buyer\/dashboard\/?$/);
  await expect(page).not.toHaveURL(/\/login(?:[/?#]|$)/);
}

export async function verifyBuyerSession(page: Page) {
  await page.goto("/buyer/dashboard", {
    waitUntil: "domcontentloaded",
  });

  const verification = await page.evaluate(async (apiOrigin) => {
    const token = window.localStorage.getItem("auth_token");
    if (!token) return { status: 0, role: "" };

    const response = await window.fetch(`${apiOrigin}/api/auth/me`, {
      method: "GET",
      headers: { Authorization: `Bearer ${token}` },
      credentials: "include",
    });

    let role = "";
    if (response.ok) {
      const payload = (await response.json().catch(() => ({}))) as {
        user?: { role?: unknown };
        data?: { user?: { role?: unknown } };
      };
      const rawRole = payload.user?.role ?? payload.data?.user?.role;
      role = typeof rawRole === "string" ? rawRole : "";
    }

    return { status: response.status, role };
  }, stagingApiOrigin);

  if (verification.status !== 200 || verification.role !== "CONSUMER") {
    throw new Error(
      `Authenticated buyer session verification failed with HTTP ${verification.status || "unavailable"}.`,
    );
  }

  await expect(page).not.toHaveURL(/\/login(?:[/?#]|$)/);
}
