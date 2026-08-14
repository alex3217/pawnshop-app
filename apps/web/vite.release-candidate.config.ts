import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  envFile: false,
  plugins: [react()],
  server: {
    host: "127.0.0.1",
    port: 5186,
    strictPort: true,
    proxy: {
      "/api": {
        target: "http://127.0.0.1:6002",
        changeOrigin: true,
        secure: false,
      },
      "/socket.io": {
        target: "http://127.0.0.1:6002",
        ws: true,
        changeOrigin: true,
        secure: false,
      },
    },
  },
});
