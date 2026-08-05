import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import { resolveEnvironmentContract } from "./src/environmentContract.mjs";

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

  return {
    plugins: [react()],
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
