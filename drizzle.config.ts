import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "postgresql",
  schema: ["./src/platform/db/schema.ts", "./src/platform/adapters/payments/mock-schema.ts", "./src/apps/*/schema.ts"],
  out: "./drizzle",
  dbCredentials: { url: process.env.DATABASE_URL ?? "postgres://app:app@localhost:5432/app" },
});
