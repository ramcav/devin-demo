import { randomUUID } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import { getDb } from "../../db/client";
import { chargeFixtures, SIMULATED, type ChargeFixture } from "./fixtures";
import { mockPaymentsCharges, mockPaymentsRefunds } from "./mock-schema";

/** Simulated payment processor. Its wire format is deliberately vendor-shaped (snake_case, nested objects). */

export type VendorCharge = {
  id: string;
  object: "charge";
  amount: number;
  currency: string;
  created: string;
  customer: { id: string; name: string };
  payment_method: { id: string; card: { last4: string } };
};

export type VendorRefund = {
  id: string;
  object: "refund";
  charge: string;
  amount: number;
  currency: string;
  payment_method: string;
  status: "succeeded";
};

export class ProviderHttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

type RefundRecord = { id: string; chargeId: string; amountCents: number; idempotencyKey: string; pmToken: string };

type LockedOps = {
  findRefundByKey(key: string): Promise<RefundRecord | null>;
  refundedTotal(chargeId: string): Promise<number>;
  insertRefund(r: RefundRecord): Promise<void>;
};

export interface MockProviderStore {
  listCharges(): Promise<ChargeFixture[]>;
  getCharge(id: string): Promise<ChargeFixture | null>;
  withChargeLock<T>(chargeId: string, fn: (ops: LockedOps) => Promise<T>): Promise<T>;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function toVendorCharge(c: ChargeFixture): VendorCharge {
  return {
    id: c.id,
    object: "charge",
    amount: c.amountCents,
    currency: c.currency.toLowerCase(),
    created: c.createdAt,
    customer: { id: c.customerId, name: c.customerName },
    payment_method: { id: c.pmToken, card: { last4: c.last4 } },
  };
}

function toVendorRefund(r: RefundRecord, currency: string): VendorRefund {
  return { id: r.id, object: "refund", charge: r.chargeId, amount: r.amountCents, currency, payment_method: r.pmToken, status: "succeeded" };
}

export class MockPaymentsProvider {
  constructor(
    private readonly store: MockProviderStore,
    private readonly opts: { slowMs?: number } = {},
  ) {}

  private slowMs(): number {
    return this.opts.slowMs ?? Number(process.env.MOCK_PAYMENTS_SLOW_MS ?? 10_000);
  }

  async listCharges(): Promise<VendorCharge[]> {
    return (await this.store.listCharges()).map(toVendorCharge);
  }

  async getCharge(id: string): Promise<VendorCharge> {
    const c = await this.store.getCharge(id);
    if (!c) throw new ProviderHttpError(404, "resource_missing", `No such charge: ${id}`);
    return toVendorCharge(c);
  }

  /** POST /refunds. Always refunds to the charge's own payment method; there is no destination parameter. */
  async createRefund(input: { charge: unknown; amount: unknown; idempotencyKey: string | null }): Promise<VendorRefund> {
    const { charge: chargeId, amount, idempotencyKey } = input;
    if (typeof chargeId !== "string" || !Number.isInteger(amount) || (amount as number) <= 0) {
      throw new ProviderHttpError(400, "invalid_request", "charge and a positive integer amount are required");
    }
    if (!idempotencyKey) throw new ProviderHttpError(400, "idempotency_key_required", "Idempotency-Key header is required");
    const charge = await this.store.getCharge(chargeId);
    if (!charge) throw new ProviderHttpError(404, "resource_missing", `No such charge: ${chargeId}`);
    if (chargeId === SIMULATED.decline) throw new ProviderHttpError(402, "refund_declined", "The refund was declined");
    if (chargeId === SIMULATED.unavailable) throw new ProviderHttpError(503, "service_unavailable", "Try again later");
    if (chargeId === SIMULATED.slow) {
      await sleep(this.slowMs());
      throw new ProviderHttpError(503, "service_unavailable", "Timed out upstream");
    }
    const amountCents = amount as number;
    return this.store.withChargeLock(chargeId, async (ops) => {
      const existing = await ops.findRefundByKey(idempotencyKey);
      if (existing) {
        if (existing.chargeId !== chargeId || existing.amountCents !== amountCents) {
          throw new ProviderHttpError(409, "idempotency_key_reused", "Idempotency key reused with different parameters");
        }
        return toVendorRefund(existing, charge.currency.toLowerCase());
      }
      if ((await ops.refundedTotal(chargeId)) + amountCents > charge.amountCents) {
        throw new ProviderHttpError(400, "amount_too_large", "Refund amount exceeds the remaining charge amount");
      }
      const record: RefundRecord = { id: `re_${randomUUID().replace(/-/g, "").slice(0, 16)}`, chargeId, amountCents, idempotencyKey, pmToken: charge.pmToken };
      await ops.insertRefund(record);
      return toVendorRefund(record, charge.currency.toLowerCase());
    });
  }
}

export function memoryStore(fixtures: ChargeFixture[] = chargeFixtures): MockProviderStore {
  const chargesById = new Map(fixtures.map((c) => [c.id, c]));
  const refunds = new Map<string, RefundRecord>();
  const locks = new Map<string, Promise<unknown>>();
  const ops: LockedOps = {
    findRefundByKey: async (key) => refunds.get(key) ?? null,
    refundedTotal: async (chargeId) => [...refunds.values()].filter((r) => r.chargeId === chargeId).reduce((s, r) => s + r.amountCents, 0),
    insertRefund: async (r) => void refunds.set(r.idempotencyKey, r),
  };
  return {
    listCharges: async () => [...chargesById.values()],
    getCharge: async (id) => chargesById.get(id) ?? null,
    withChargeLock(chargeId, fn) {
      const run = (locks.get(chargeId) ?? Promise.resolve()).then(() => fn(ops));
      locks.set(chargeId, run.catch(() => undefined));
      return run;
    },
  };
}

function rowToFixture(r: typeof mockPaymentsCharges.$inferSelect): ChargeFixture {
  return { ...r, currency: "USD", createdAt: r.createdAt.toISOString() };
}

export function postgresStore(): MockProviderStore {
  return {
    async listCharges() {
      return (await getDb().select().from(mockPaymentsCharges).orderBy(mockPaymentsCharges.id)).map(rowToFixture);
    },
    async getCharge(id) {
      const [row] = await getDb().select().from(mockPaymentsCharges).where(eq(mockPaymentsCharges.id, id));
      return row ? rowToFixture(row) : null;
    },
    withChargeLock(chargeId, fn) {
      return getDb().transaction(async (tx) => {
        await tx.select({ id: mockPaymentsCharges.id }).from(mockPaymentsCharges).where(eq(mockPaymentsCharges.id, chargeId)).for("update");
        return fn({
          async findRefundByKey(key) {
            const [r] = await tx.select().from(mockPaymentsRefunds).where(eq(mockPaymentsRefunds.idempotencyKey, key));
            return r ?? null;
          },
          async refundedTotal(id) {
            const [r] = await tx
              .select({ total: sql<number>`coalesce(sum(${mockPaymentsRefunds.amountCents}), 0)::int` })
              .from(mockPaymentsRefunds)
              .where(and(eq(mockPaymentsRefunds.chargeId, id)));
            return r?.total ?? 0;
          },
          async insertRefund(r) {
            await tx.insert(mockPaymentsRefunds).values(r);
          },
        });
      });
    },
  };
}

const globalForProvider = globalThis as unknown as { __mockPaymentsProvider?: MockPaymentsProvider };

/** The provider behind /api/mock-payments, persisted in Postgres. */
export function mockPaymentsProvider(): MockPaymentsProvider {
  globalForProvider.__mockPaymentsProvider ??= new MockPaymentsProvider(postgresStore());
  return globalForProvider.__mockPaymentsProvider;
}

export async function seedMockPaymentsProvider(db: ReturnType<typeof getDb>): Promise<void> {
  await db
    .insert(mockPaymentsCharges)
    .values(chargeFixtures.map((c) => ({ ...c, createdAt: new Date(c.createdAt) })))
    .onConflictDoNothing();
}
