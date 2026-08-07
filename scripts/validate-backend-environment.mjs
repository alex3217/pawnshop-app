import { validateDeployedEnvironment } from "../apps/api/backend/src/config/deployedEnvironment.js";

const environment = String(process.argv[2] || process.env.APP_ENV || "").trim().toLowerCase();

try {
  const metadata = validateDeployedEnvironment(process.env, { environment });
  console.log("Backend deployed-environment contract passed.", {
    environment: metadata.environment,
    service: metadata.service,
    revision: metadata.revision,
    databaseHost: metadata.databaseHost,
    schedulerOwner: metadata.schedulerOwner,
    stripeMode: metadata.stripeMode,
  });
} catch (error) {
  console.error(error instanceof Error ? error.message : "Backend deployed-environment contract failed.");
  process.exitCode = 1;
}
