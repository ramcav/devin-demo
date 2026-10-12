import { closeDb, getDb } from "../src/platform/db/client";
import { seedAll } from "./seed-data";

async function main() {
  await seedAll(getDb());
  console.log("seed applied");
  await closeDb();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
