import { defineConfig, loadEnv, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import { resolveEnvironmentContract } from "./src/environmentContract.mjs";

const SHA = /^[0-9a-f]{40}$/;

export function createReleaseArtifact(env: Record<string, string>, generatedAt = new Date()) {
  const revision = String(env.CF_PAGES_COMMIT_SHA || env.GITHUB_SHA || env.VITE_RELEASE_SHA || "").trim();
  if (!SHA.test(revision)) {
    throw new Error("Frontend builds require an exact lowercase 40-character release SHA");
  }
  const artifact = JSON.stringify({ revision, generatedAt: generatedAt.toISOString() });
  if (Buffer.byteLength(artifact) > 1024) throw new Error("Frontend release artifact exceeds its safety limit");
  return artifact;
}

export default defineConfig(({ command, mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  resolveEnvironmentContract({
    deployEnv: env.VITE_DEPLOY_ENV,
    apiOrigin: env.VITE_API_ORIGIN,
    apiPath: env.VITE_API_BASE,
    apiPathAlias: env.VITE_API_BASE_URL,
    socketUrl: env.VITE_SOCKET_URL,
    socketPath: env.VITE_SOCKET_PATH,
  }, {
    isDev: command === "serve" && mode !== "production",
  });
  const apiTarget = env.VITE_API_TARGET || "http://127.0.0.1:6002";
  const releaseArtifact = command === "build" ? createReleaseArtifact(env) : null;
  const releasePlugin: Plugin | null = releaseArtifact ? {
    name: "pawnloop-release-artifact",
    generateBundle() {
      this.emitFile({ type: "asset", fileName: "release.json", source: releaseArtifact });
    },
  } : null;

  return {
    plugins: [
      react(),
      ...(releasePlugin ? [releasePlugin] : []),
    ],
    server: {
      host: "127.0.0.1",
      port: 5176,
      strictPort: true,
      proxy: {
        "/api": {
          target: apiTarget,
          changeOrigin: true,
          secure: false,
        },
        "/socket.io": {
          target: apiTarget,
          ws: true,
          changeOrigin: true,
          secure: false,
        },
      },
    },
    preview: {
      host: "127.0.0.1",
      port: 4176,
      strictPort: true,
    },
  };
});
