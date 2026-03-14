import path from "node:path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { brandedDevServerHosts } from "./vite.allowed-hosts";

export default defineConfig({
  plugins: [react()],
  server: {
    allowedHosts: [...brandedDevServerHosts]
  },
  resolve: {
    alias: {
      "@paretoproof/shared": path.resolve(__dirname, "../../packages/shared/src/index.ts")
    }
  }
});
