import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: [
      "packages/**/*.test.ts",
      "packages/**/*.spec.ts",
      "packages/**/*.test.tsx",
      "packages/**/*.spec.tsx",
      "apps/**/*.test.ts",
      "apps/**/*.spec.ts",
      "apps/**/*.test.tsx",
      "apps/**/*.spec.tsx"
    ],
    exclude: ["tests/**", "**/dist/**", "**/node_modules/**"]
  }
});
