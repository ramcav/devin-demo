import { charges } from "../src/apps/refunds/schema";
import { chargeFixtures } from "../src/platform/adapters/payments/fixtures";
import { seedMockPaymentsProvider } from "../src/platform/adapters/payments/mock-provider";
import type { Db } from "../src/platform/db/client";
import { seed as seedPlatform } from "../src/platform/db/seed";

/** Idempotent seed for local dev, Compose and tests. All data is synthetic. */
export async function seedAll(db: Db): Promise<void> {
  await seedPlatform(db);
  // The simulated provider's own data…
  await seedMockPaymentsProvider(db);
  // …and the Refunds app's local mirror of those charges.
  await db
    .insert(charges)
    .values(
      chargeFixtures.map((c) => ({
        id: c.id,
        customerId: c.customerId,
        customerName: c.customerName,
        amountCents: c.amountCents,
        currency: c.currency,
        paymentMethodToken: c.pmToken,
        last4: c.last4,
        createdAt: new Date(c.createdAt),
      })),
    )
    .onConflictDoNothing();
}
