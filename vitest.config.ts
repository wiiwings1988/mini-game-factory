import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const here = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      "@factory/engine": path.join(here, "packages/engine/src/index.ts"),
      "@factory/platform": path.join(here, "packages/platform/src/index.ts"),
      "@factory/games": path.join(here, "games"),
    },
  },
  test: {
    include: ["packages/**/*.test.ts", "games/**/*.test.ts", "tools/**/*.test.ts"],
    environment: "node",
  },
});
