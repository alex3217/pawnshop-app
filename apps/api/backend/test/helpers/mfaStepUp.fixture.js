import crypto from "node:crypto";
import jwt from "jsonwebtoken";
import { prisma } from "../../src/lib/prisma.js";
import { digestMfaValue } from "../../src/services/mfaCrypto.service.js";

const TEST_MFA_KEY = Buffer.alloc(32, 73);

export function resetMfaTestMode() {
  process.env.MFA_MODE = "disabled";
  delete process.env.MFA_ENCRYPTION_KEY;
}

export async function issueMfaStepUpProof({ token, userId, scope }) {
  const sessionId = String(jwt.decode(token)?.jti || "");
  if (!sessionId) throw new Error("Integration MFA proof requires a token jti");
  process.env.MFA_MODE = "required";
  process.env.MFA_ENCRYPTION_KEY = TEST_MFA_KEY.toString("base64");
  const now = new Date();
  const proof = `integration-proof-${crypto.randomUUID()}`;
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { authVersion: true } });
  const challenge = await prisma.mfaChallenge.create({
    data: {
      userId,
      purpose: "STEP_UP",
      credentialDigest: digestMfaValue(`integration-challenge-${crypto.randomUUID()}`, TEST_MFA_KEY),
      expiresAt: new Date(now.getTime() + 60_000),
      attemptsRemaining: 0,
      consumedAt: now,
      authVersion: user.authVersion,
      sessionDigest: digestMfaValue(`session:${sessionId}`, TEST_MFA_KEY),
      operationScope: scope,
    },
  });
  await prisma.mfaStepUpProof.create({
    data: {
      challengeId: challenge.id,
      userId,
      sessionDigest: digestMfaValue(`session:${sessionId}`, TEST_MFA_KEY),
      operationScope: scope,
      credentialDigest: digestMfaValue(proof, TEST_MFA_KEY),
      expiresAt: new Date(now.getTime() + 60_000),
    },
  });
  return proof;
}
