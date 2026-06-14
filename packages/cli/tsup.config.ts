import { cpSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { defineConfig } from "tsup";

export default defineConfig({
  entry: { main: "src/main.ts" },
  format: ["esm"],
  target: "node22",
  outDir: "dist",
  // Bundle all @glassbox/* workspace packages into the single output file.
  // node:* built-ins stay external — they ship with Node 22.
  noExternal: [/^@glassbox\//],
  // Keep the shebang so `glassbox` is directly executable after npm install -g.
  banner: { js: "#!/usr/bin/env node" },
  clean: true,
  sourcemap: false,
  splitting: false,
  dts: false,
  async onSuccess() {
    // Copy the built UI into dist/ui/ so it's included in the published package.
    // The server's resolveUiDist() looks here first when running from an npm install.
    const uiSrc = resolve(__dirname, "../../packages/ui/dist");
    const uiDest = resolve(__dirname, "dist/ui");
    if (existsSync(uiSrc)) {
      cpSync(uiSrc, uiDest, { recursive: true });
      console.log(`  copied UI assets → dist/ui/`);
    } else {
      console.warn(
        `  warning: packages/ui/dist not found — run pnpm build:ui first, or the web dashboard won't work`,
      );
    }
  },
});
