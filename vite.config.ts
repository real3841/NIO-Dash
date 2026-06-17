import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      "/api/nio": {
        target: "https://app.nio.com",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/nio/, ""),
      },
      "/api/config": {
        target: "http://127.0.0.1:8787",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ""),
      },
      "/api/fetch-now": {
        target: "http://127.0.0.1:8787",
        changeOrigin: true,
        rewrite: () => "/trigger",
      },
      "/api/fetch-vehicle": {
        target: "http://127.0.0.1:8787",
        changeOrigin: true,
        rewrite: () => "/trigger/vehicle",
      },
      "/api/fetch-change": {
        target: "http://127.0.0.1:8787",
        changeOrigin: true,
        rewrite: () => "/trigger/change",
      },
    },
  },
});
