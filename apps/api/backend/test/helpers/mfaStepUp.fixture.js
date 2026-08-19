import request from "supertest";
import { prisma } from "../../src/lib/prisma.js";
import { confirmMfaEnrollment, startMfaEnrollment } from "../../src/services/mfa.service.js";
import { createTotpCode } from "../../src/services/mfaCrypto.service.js";

const TEST_MFA_KEY = Buffer.alloc(32, 73);
const enrollmentByUser = new Map();

export function resetMfaTestMode() {
  process.env.MFA_MODE = "disabled";
  delete process.env.MFA_ENCRYPTION_KEY;
  enrollmentByUser.clear();
}

export async function ensureMfaEnrollment(userId) {
  const remembered = enrollmentByUser.get(userId);
  if (remembered) return remembered;
  const existing = await prisma.userMfaCredential.findUnique({ where: { userId } });
  if (existing?.enabledAt) {
    throw new Error("Real-protocol integration helper cannot recover an existing TOTP secret");
  }
  const started = await startMfaEnrollment({ userId, encryptionKey: TEST_MFA_KEY });
  const confirmed = await confirmMfaEnrollment({
    userId,
    encryptionKey: TEST_MFA_KEY,
    token: await createTotpCode({ secret: started.secret, epochSeconds: Math.floor(Date.now() / 1000) - 30 }),
  });
  const enrollment = { secret: started.secret, recoveryCodes: confirmed.recoveryCodes, proofCount: 0 };
  enrollmentByUser.set(userId, enrollment);
  return enrollment;
}

export async function issueMfaStepUpProof({ app, token, userId, scope, method, recoveryCode }) {
  if (!app) throw new Error("Real-protocol MFA proof issuance requires the application");
  process.env.MFA_MODE = "required";
  process.env.MFA_ENCRYPTION_KEY = TEST_MFA_KEY.toString("base64");
  const enrollment = await ensureMfaEnrollment(userId);
  const issued = await request(app).post("/api/auth/mfa/step-up")
    .set("Authorization", `Bearer ${token}`).send({ scope });
  if (issued.status !== 201) throw new Error(`MFA challenge issuance failed: ${issued.status}`);
  const effectiveMethod = method || (enrollment.proofCount === 0 ? "totp" : "recovery_code");
  const code = effectiveMethod === "recovery_code"
    ? (recoveryCode || enrollment.recoveryCodes[enrollment.proofCount - 1])
    : await createTotpCode({ secret: enrollment.secret });
  const verified = await request(app).post("/api/auth/mfa/step-up/verify")
    .set("Authorization", `Bearer ${token}`)
    .send({ scope, challenge: issued.body.challenge, method: effectiveMethod, code });
  if (verified.status !== 200 || !verified.body.proof) {
    throw new Error(`MFA challenge verification failed: ${verified.status}`);
  }
  enrollment.proofCount += 1;
  return { proof: verified.body.proof, enrollment, challenge: issued.body.challenge };
}
