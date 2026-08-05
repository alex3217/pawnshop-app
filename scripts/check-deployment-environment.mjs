import { pathToFileURL } from "node:url";
import { resolveEnvironmentContract } from "../apps/web/src/environmentContract.mjs";

export function validateDeploymentEnvironment(env = process.env) {
  return resolveEnvironmentContract({
    deployEnv: env.VITE_DEPLOY_ENV,
    apiOrigin: env.VITE_API_ORIGIN,
    apiPath: env.VITE_API_BASE,
    apiPathAlias: env.VITE_API_BASE_URL,
    socketUrl: env.VITE_SOCKET_URL,
    socketPath: env.VITE_SOCKET_PATH,
  }, { isDev: false });
}

export function main(env = process.env) {
  const contract = validateDeploymentEnvironment(env);
  console.log(`Deployment environment contract passed for ${contract.deployEnv}.`);
  return contract;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    main(process.env);
  } catch (error) {
    console.error(`Deployment environment contract failed: ${error.message}`);
    process.exitCode = 1;
  }
}
