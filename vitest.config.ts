import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const testDatabaseUrl = process.env.TEST_DATABASE_URL ?? "postgres://app:app@localhost:5432/app_test";

export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  test: {
    include: ["tests/**/*.test.ts"],
    globalSetup: ["tests/global-setup.ts"],
    fileParallelism: false,
    testTimeout: 20_000,
    hookTimeout: 60_000,
    env: {
      DATABASE_URL: testDatabaseUrl,
      TEST_DATABASE_URL: testDatabaseUrl,
      SESSION_SECRET: "test-session-secret-not-for-prod",
      AUTH_ADAPTER: "mock",
      PAYMENTS_ADAPTER: "mock",
    },
  },
});
