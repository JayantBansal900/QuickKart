import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath, URL } from "node:url";
import { defineConfig, type ProxyOptions } from "vite";

/**
 * Dev proxy to the API gateway. Everything goes through the gateway (never straight to a
 * service), exactly like nginx does in Docker.
 *
 * The browser sees /api as same-origin, but would still send `Origin: http://localhost:5173`
 * on POSTs; the gateway's CORS list only allows the real frontend origin, so it answered 403
 * and login/register failed in dev. The proxy therefore drops the Origin header.
 */
const toGateway: ProxyOptions = {
  target: "http://localhost:8080",
  changeOrigin: true,
  secure: false,
  configure: (proxy) => {
    proxy.on("proxyReq", (proxyReq) => proxyReq.removeHeader("origin"));
  },
};

export default defineConfig({
  plugins: [react(), tailwindcss()],

  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./", import.meta.url)),
    },
  },

  server: {
    // HMR can be disabled when DISABLE_HMR=true.
    hmr: process.env.DISABLE_HMR !== "true",

    // Disable file watching when DISABLE_HMR=true.
    watch: process.env.DISABLE_HMR === "true" ? null : {},

    proxy: {
      "/api": toGateway,
      "/actuator": toGateway,
    },
  },
});
