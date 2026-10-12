import { closeDb, getDb } from "../src/platform/db/client";
import { seed } from "../src/platform/db/seed";

async function main() {
  await seed(getDb());
  console.log("seed applied");
  await closeDb();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
