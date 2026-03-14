import path from "node:path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { paretoProofBrandedHosts } from "./src/lib/local-development";

export const paretoProofDevAllowedHosts = [...paretoProofBrandedHosts];

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@paretoproof/shared": path.resolve(__dirname, "../../packages/shared/src/index.ts")
    }
  },
  server: {
    allowedHosts: paretoProofDevAllowedHosts
  }
});
