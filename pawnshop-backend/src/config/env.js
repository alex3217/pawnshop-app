import dotenv from "dotenv";

dotenv.config();

export const env = {
  nodeEnv: process.env.NODE_ENV ?? "development",
  port: Number(process.env.PORT ?? process.env.PAWN_PORT ?? 6002),
  databaseUrl: process.env.DATABASE_URL,
  jwtSecret: process.env.JWT_SECRET,
  jwtExpiresIn: process.env.JWT_EXPIRES_IN ?? "7d",
  holdDefaultMinutes: Number(process.env.HOLD_DEFAULT_MINUTES ?? 90),
  holdExpiryIntervalMs: Number(process.env.HOLD_EXPIRY_INTERVAL_MS ?? 60_000),
  appBaseUrl: process.env.APP_BASE_URL ?? "http://localhost:5178",
};

if (!env.databaseUrl) throw new Error("Missing DATABASE_URL");
if (!env.jwtSecret) throw new Error("Missing JWT_SECRET");
