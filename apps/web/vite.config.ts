import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import {
  DEFAULT_VITE_API_TARGET,
  resolveViteApiTarget,
} from "./viteProxyTarget.js";

export default defineConfig(({ command }) => {
  const apiTarget =
    command === "serve"
      ? resolveViteApiTarget(process.env.VITE_API_TARGET)
      : DEFAULT_VITE_API_TARGET;

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
