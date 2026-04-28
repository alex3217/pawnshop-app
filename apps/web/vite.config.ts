import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const API_TARGET = process.env.VITE_API_TARGET || "http://127.0.0.1:6002";

export default defineConfig({
  plugins: [react()],
  server: {
    host: "127.0.0.1",
    port: 5176,
    strictPort: true,
    proxy: {
      "/api": {
        target: API_TARGET,
        changeOrigin: true,
        secure: false,
      },
      "/socket.io": {
        target: API_TARGET,
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
});