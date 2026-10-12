import { migrate } from "drizzle-orm/postgres-js/migrator";
import { closeDb, getDb } from "../src/platform/db/client";

async function main() {
  await migrate(getDb(), { migrationsFolder: "./drizzle" });
  console.log("migrations applied");
  await closeDb();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
