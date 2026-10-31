import path from "node:path";
import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";
import { defineConfig } from "vite";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "../..");
const pkg = JSON.parse(readFileSync(path.join(repoRoot, "package.json"), "utf8")) as { version: string };

export default defineConfig({
  root: here,
  base: "./",
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  resolve: {
    alias: {
      "@factory/engine": path.join(repoRoot, "packages/engine/src/index.ts"),
      "@factory/platform": path.join(repoRoot, "packages/platform/src/index.ts"),
      "@factory/games": path.join(repoRoot, "games"),
    },
  },
  server: {
    port: 5173,
    host: "127.0.0.1",
    proxy: {
      "/api": {
        target: "http://127.0.0.1:8787",
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: path.join(repoRoot, "dist/web"),
    emptyOutDir: true,
    target: "es2020",
    sourcemap: true,
  },
});
