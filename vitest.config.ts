import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["tests/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}"],
    exclude: ["tests/e2e/**", "node_modules/**"],
    testTimeout: 75000,
    hookTimeout: 75000,
    fileParallelism: false,
    env: {
      USE_MOCK_STORE: "true",
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./"),
    },
  },
});
