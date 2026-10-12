import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import { connect } from "../src/platform/db/client";
import { seed } from "../src/platform/db/seed";

// Recreates the test database from scratch so every run starts clean (audit_log can't be truncated by design).
export default async function setup() {
  const url = new URL(process.env.TEST_DATABASE_URL ?? "postgres://app:app@localhost:5432/app_test");
  const dbName = url.pathname.slice(1);
  if (!/^[a-z0-9_]+$/.test(dbName) || !dbName.endsWith("_test")) {
    throw new Error(`Refusing to recreate non-test database "${dbName}"`);
  }
  const adminUrl = new URL(url);
  adminUrl.pathname = "/postgres";
  const admin = postgres(adminUrl.toString(), { max: 1, onnotice: () => {} });
  await admin.unsafe(`DROP DATABASE IF EXISTS ${dbName} WITH (FORCE)`);
  await admin.unsafe(`CREATE DATABASE ${dbName}`);
  await admin.end();

  const { sql, db } = connect(url.toString());
  await migrate(db, { migrationsFolder: "./drizzle" });
  await seed(db);
  await sql.end();
}
