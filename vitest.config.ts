import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    coverage: {
      include: ["src/**/*.ts"],
      provider: "v8",
      reporter: ["text", "json-summary"],
      reportsDirectory: "coverage",
      thresholds: {
        perFile: true,
        "src/consistency/diff.ts": { branches: 90 },
        "src/consistency/path.ts": { branches: 90 },
        "src/consistency/reconcile.ts": { branches: 90 },
        "src/engine/commit.ts": { branches: 90 },
      },
    },
  },
});
