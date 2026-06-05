import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Relative base so the built SPA can be served from any path by the local CLI
// server. During `vite dev`, proxy the API to that server (default port 4317).
export default defineConfig({
  plugins: [react()],
  base: "./",
  build: { outDir: "dist", emptyOutDir: true },
  server: {
    proxy: {
      "/api": "http://127.0.0.1:4317",
    },
  },
});
