import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "../..");

export default defineConfig({
  resolve: {
    alias: {
      "@factory/engine": path.join(repoRoot, "packages/engine/src/index.ts"),
      "@factory/platform": path.join(repoRoot, "packages/platform/src/index.ts"),
      "@factory/games": path.join(repoRoot, "games"),
    },
  },
  build: {
    outDir: path.join(repoRoot, "dist/wx"),
    emptyOutDir: false,
    target: "es2018",
    minify: "esbuild",
    lib: {
      entry: path.join(here, "src/main.ts"),
      formats: ["iife"],
      name: "ArcadeDodge",
      fileName: () => "game.js",
    },
    rollupOptions: {
      output: { extend: true },
    },
  },
});
