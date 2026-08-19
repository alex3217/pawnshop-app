import { API_BASE } from "../config";
import { getAuthHeaders } from "./auth";

export type MfaStepUpMethod = "totp" | "recovery_code";
export type MfaStepUpInput = { method: MfaStepUpMethod; code: string };
export type MfaStepUpPrompt = (scope: string) => Promise<MfaStepUpInput>;

let promptHandler: MfaStepUpPrompt | null = null;

export function setMfaStepUpPrompt(handler: MfaStepUpPrompt | null) {
  promptHandler = handler;
}

async function post(path: string, body: unknown) {
  const response = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: { ...getAuthHeaders(false), "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const text = await response.text();
  const payload = text ? JSON.parse(text) : {};
  if (!response.ok) throw new Error(payload?.error || "Privileged authentication failed");
  return payload;
}

export async function requestMfaStepUpProof(scope: string): Promise<string> {
  if (!promptHandler) throw new Error("Privileged authentication is unavailable");
  let lastError: unknown;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const issued = await post("/auth/mfa/step-up", { scope });
    const input = await promptHandler(scope);
    try {
      const verified = await post("/auth/mfa/step-up/verify", {
        scope,
        challenge: issued.challenge,
        method: input.method,
        code: input.code,
      });
      if (typeof verified.proof !== "string" || !verified.proof) {
        throw new Error("Privileged authentication did not return a proof");
      }
      return verified.proof;
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError instanceof Error ? lastError : new Error("Privileged authentication failed");
}

export function getMfaRequiredScope(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") return null;
  const value = payload as Record<string, unknown>;
  return value.code === "MFA_STEP_UP_REQUIRED" && typeof value.scope === "string"
    ? value.scope
    : null;
}
