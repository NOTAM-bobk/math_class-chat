import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const workerUrl = process.env.CHAT_WORKER_URL ?? "http://127.0.0.1:8788";

export default defineConfig({
  plugins: [react()],
  build: {
    outDir: "dist",
    emptyOutDir: true,
  },
  server: {
    host: "0.0.0.0",
    port: 3000,
    proxy: {
      "/api": { target: workerUrl, changeOrigin: true },
    },
  },
});
