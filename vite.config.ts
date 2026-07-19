import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

/** Electron 内置静态服务不送 CORS 头，去掉 crossorigin 避免模块脚本加载失败 */
function stripCrossOrigin() {
  return {
    name: "strip-crossorigin",
    transformIndexHtml(html: string) {
      return html.replace(/ crossorigin/g, "");
    },
  };
}

export default defineConfig({
  plugins: [react(), stripCrossOrigin()],
  build: {
    modulePreload: false,
  },
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
      "/api/fetch-log": {
        target: "http://127.0.0.1:8787",
        changeOrigin: true,
        rewrite: () => "/fetch-log",
      },
      "/api/card-layout": {
        target: "http://127.0.0.1:8787",
        changeOrigin: true,
      },
    },
  },
});
