const SYSTEM_ENV_KEYS = [
  "CI",
  "HOME",
  "LANG",
  "LC_ALL",
  "PATH",
  "PLAYWRIGHT_BROWSERS_PATH",
  "PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH",
  "RUNNER_TEMP",
  "TMPDIR",
];

export function createReleaseCandidateChildEnv(parentEnv = process.env) {
  const env = {};

  for (const key of SYSTEM_ENV_KEYS) {
    if (parentEnv[key]) env[key] = parentEnv[key];
  }

  return {
    ...env,
    NODE_ENV: "test",
    VITE_API_BASE: "/api",
    VITE_API_BASE_URL: "/api",
    VITE_API_TARGET: "http://127.0.0.1:6002",
    VITE_DEPLOY_ENV: "development",
    VITE_GOOGLE_MAPS_BROWSER_API_KEY: "test_browser_key",
    VITE_SOCKET_PATH: "/socket.io",
    VITE_STRIPE_PUBLISHABLE_KEY: "pk_test_release_candidate_browser_only",
  };
}

export const releaseCandidateSystemEnvKeys = Object.freeze(SYSTEM_ENV_KEYS);
