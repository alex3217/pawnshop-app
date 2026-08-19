import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import { resolveEnvironmentContract } from "../src/environmentContract.mjs";
import { validateDeploymentTarget } from "./deploymentTargets.mjs";

export function resolveBuildEnvironment(env = process.env) {
  const resolved = { ...env };

  validateDeploymentTarget(resolveEnvironmentContract({
    deployEnv: resolved.VITE_DEPLOY_ENV,
    apiOrigin: resolved.VITE_API_ORIGIN,
    apiPath: resolved.VITE_API_BASE,
    apiPathAlias: resolved.VITE_API_BASE_URL,
    socketUrl: resolved.VITE_SOCKET_URL,
    socketPath: resolved.VITE_SOCKET_PATH,
  }));

  return resolved;
}

function run(command, args, env) {
  const result = spawnSync(command, args, {
    cwd: new URL("..", import.meta.url),
    env,
    stdio: "inherit",
  });

  if (result.error) throw result.error;
  if (result.signal) process.kill(process.pid, result.signal);
  return result.status ?? 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const env = resolveBuildEnvironment(process.env);
  let status = run("tsc", ["-b"], env);
  if (status === 0) status = run("vite", ["build"], env);
  process.exitCode = status;
}
