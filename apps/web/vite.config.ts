import path from "node:path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@paretoproof/shared": path.resolve(__dirname, "../../packages/shared/src/index.ts")
    }
  }
});
