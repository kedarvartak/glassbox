import { defineConfig } from "vitest/config";

// Single root config; each package keeps its tests under its own `src/**` or
// `test/**`. Vitest discovers them across the workspace. Kept deliberately
// minimal — analysis correctness lives in golden-file tests added in Phase 1.
export default defineConfig({
  test: {
    include: ["packages/*/src/**/*.test.ts", "packages/*/test/**/*.test.ts"],
    environment: "node",
  },
});
