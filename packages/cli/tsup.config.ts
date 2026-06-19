import { defineConfig } from "tsup";

export default defineConfig({
  entry: { main: "src/main.ts" },
  format: ["esm"],
  target: "node22",
  outDir: "dist",
  // Bundle all @glassbox/* workspace packages into the single output file.
  // node:* built-ins stay external — they ship with Node 22.
  noExternal: [/^@glassbox\//],
  // src/main.ts already carries the `#!/usr/bin/env node` shebang and tsup
  // preserves it — no banner needed (a banner would duplicate it).
  clean: true,
  sourcemap: false,
  splitting: false,
  dts: false,
});
