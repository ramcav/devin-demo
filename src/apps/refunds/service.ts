import { randomUUID } from "node:crypto";
import { and, eq, inArray, ne, sql, type SQL } from "drizzle-orm";
import { z } from "zod";
import { approvals, type ApprovalSubject } from "@/platform/approvals";
import { audit } from "@/platform/audit";
import { getDb, type DbOrTx, type Tx } from "@/platform/db/client";
import { users } from "@/platform/db/schema";
import { ConflictError, NotFoundError, UpstreamError, ValidationError } from "@/platform/errors";
import { formatMoney, maskCard } from "@/platform/format";
import { gridQuery, type GridParams, type GridSpec } from "@/platform/grid";
import { ChargeNotFound, getPayments, PaymentsError, type Charge } from "@/platform/payments";
import { authorize, can } from "@/platform/policy";
import type { User } from "@/platform/ports/auth";
import { requiredApprovalsFor } from "./rules";
import { charges, refundRequests, refundStatuses, reservingStatuses, type RefundStatus } from "./schema";

export const ENTITY = "refund_request";

export type RefundDecision = "approve" | "reject";

// No destination field, and unknown keys are rejected: a refund always goes to the original payment method (INV-5).
const createInput = z
  .object({
    chargeId: z.string().min(1).max(64),
    amountCents: z.number().int("amount must be whole cents").positive("amount must be greater than 0"),
    reason: z.string().trim().min(3, "reason is required").max(500),
  })
  .strict();

type RefundRow = typeof refundRequests.$inferSelect;

export type RefundSummary = { id: string; status: RefundStatus; requiredApprovals: number; amountCents: number; chargeId: string };

function summary(row: RefundRow): RefundSummary {
  return { id: row.id, status: row.status, requiredApprovals: row.requiredApprovals, amountCents: row.amountCents, chargeId: row.chargeId };
}

function subjectOf(row: RefundRow): ApprovalSubject {
  return { entityType: ENTITY, entityId: row.id, createdBy: row.createdBy, requiredApprovals: row.requiredApprovals };
}

async function reservedCents(tx: DbOrTx, chargeId: string, excludeId?: string): Promise<number> {
  const conditions = [eq(refundRequests.chargeId, chargeId), inArray(refundRequests.status, reservingStatuses)];
  if (excludeId) conditions.push(ne(refundRequests.id, excludeId));
  const [r] = await tx
    .select({ total: sql<number>`coalesce(sum(${refundRequests.amountCents}), 0)::int` })
    .from(refundRequests)
    .where(and(...conditions));
  return r?.total ?? 0;
}

async function lockCharge(tx: Tx, chargeId: string) {
  const [row] = await tx.select().from(charges).where(eq(charges.id, chargeId)).for("update");
  if (!row) throw new NotFoundError("Charge not found");
  return row;
}

function mirror(c: Charge) {
  return {
    customerId: c.customerId,
    customerName: c.customerName,
    amountCents: c.amountCents,
    currency: c.currency,
    paymentMethodToken: c.paymentMethodToken,
    last4: c.last4,
    createdAt: new Date(c.createdAt),
  };
}

function validationMessage(err: z.ZodError): string {
  return err.issues.map((i) => (i.code === "unrecognized_keys" ? i.message : `${i.path.join(".")}: ${i.message}`)).join("; ");
}

export async function createRefund(user: User | null, input: unknown): Promise<RefundSummary> {
  const actor = await authorize(user, "refund.create");
  const parsed = createInput.safeParse(input);
  if (!parsed.success) throw new ValidationError(validationMessage(parsed.error));
  const { chargeId, amountCents, reason } = parsed.data;

  let charge: Charge;
  try {
    charge = await getPayments().getCharge(chargeId);
  } catch (err) {
    if (err instanceof ChargeNotFound) throw new ValidationError("Unknown charge");
    if (err instanceof PaymentsError) throw new UpstreamError("The payment provider is unavailable; try again");
    throw err;
  }

  return audit.change(actor, { action: "refund.create", entityType: ENTITY }, async (tx) => {
    await tx.insert(charges).values({ id: charge.id, ...mirror(charge) }).onConflictDoUpdate({ target: charges.id, set: mirror(charge) });
    await lockCharge(tx, charge.id);
    const remaining = charge.amountCents - (await reservedCents(tx, charge.id));
    if (amountCents > remaining) {
      throw new ValidationError(`Amount exceeds the refundable balance of this charge (${formatMoney(remaining, charge.currency)})`);
    }
    const [row] = await tx
      .insert(refundRequests)
      .values({
        id: `rf_${randomUUID().replace(/-/g, "").slice(0, 10)}`,
        chargeId: charge.id,
        amountCents,
        currency: charge.currency,
        reason,
        status: "pending",
        requiredApprovals: requiredApprovalsFor(amountCents),
        createdBy: actor.id,
      })
      .returning();
    const created = row!;
    return {
      result: summary(created),
      entityId: created.id,
      before: null,
      after: { status: created.status, chargeId: created.chargeId, amountCents, currency: created.currency, requiredApprovals: created.requiredApprovals, reason },
    };
  });
}

export async function decideRefund(
  user: User | null,
  id: string,
  decision: RefundDecision,
  reason?: string | null,
): Promise<RefundSummary> {
  const actor = await authorize(user, "refund.approve", { type: ENTITY, id });
  const trimmed = reason?.trim() || null;
  if (decision === "reject" && !trimmed) throw new ValidationError("A reason is required to reject a refund");

  const decided = await audit.change(actor, { action: `refund.${decision}`, entityType: ENTITY, entityId: id, reason: trimmed }, async (tx) => {
    const [row] = await tx.select().from(refundRequests).where(eq(refundRequests.id, id)).for("update");
    if (!row) throw new NotFoundError("Refund not found");
    const state = await approvals.decide(tx, subjectOf(row), actor, decision, trimmed);
    if (state.status === "approved") {
      const charge = await lockCharge(tx, row.chargeId);
      if ((await reservedCents(tx, row.chargeId, row.id)) + row.amountCents > charge.amountCents) {
        throw new ValidationError("Refund now exceeds the refundable balance of the charge");
      }
    }
    const [updated] = await tx.update(refundRequests).set({ status: state.status }).where(eq(refundRequests.id, id)).returning();
    return {
      result: updated!,
      before: { status: row.status },
      after: { status: state.status, decision, approvals: state.approvals, required: state.required },
    };
  });

  return decided.status === "approved" ? settle(actor, id) : summary(decided);
}

export async function retryRefundPayment(user: User | null, id: string): Promise<RefundSummary> {
  const actor = await authorize(user, "refund.retry_payment", { type: ENTITY, id });
  return settle(actor, id);
}

/** Pays an approved refund through the payments port, then records the outcome (one audit row). */
async function settle(actor: User, id: string): Promise<RefundSummary> {
  const [found] = await getDb()
    .select({ refund: refundRequests, charge: charges })
    .from(refundRequests)
    .innerJoin(charges, eq(charges.id, refundRequests.chargeId))
    .where(eq(refundRequests.id, id));
  if (!found) throw new NotFoundError("Refund not found");
  const { refund, charge } = found;
  if (refund.status !== "approved" && refund.status !== "payment_failed") {
    throw new ConflictError("not_payable", "Only approved refunds can be paid");
  }

  let failure: string | null = null;
  let issued: Awaited<ReturnType<ReturnType<typeof getPayments>["issueRefund"]>> | null = null;
  try {
    // The refund id is the idempotency key: retries can never pay twice.
    issued = await getPayments().issueRefund({ chargeId: refund.chargeId, amountCents: refund.amountCents, idempotencyKey: refund.id });
    if (issued.paymentMethodToken !== charge.paymentMethodToken) failure = "destination_mismatch";
    else if (issued.chargeId !== refund.chargeId || issued.amountCents !== refund.amountCents) failure = "provider_mismatch";
  } catch (err) {
    if (!(err instanceof PaymentsError)) throw err;
    failure = err.code;
  }

  return audit.change(actor, { action: failure ? "refund.payment_failed" : "refund.paid", entityType: ENTITY, entityId: id }, async (tx) => {
    const [cur] = await tx.select().from(refundRequests).where(eq(refundRequests.id, id)).for("update");
    if (!cur || (cur.status !== "approved" && cur.status !== "payment_failed")) {
      throw new ConflictError("not_payable", "Refund changed while it was being paid");
    }
    if (failure || !issued) {
      const [row] = await tx
        .update(refundRequests)
        .set({ status: "payment_failed", failureReason: failure })
        .where(eq(refundRequests.id, id))
        .returning();
      return { result: summary(row!), before: { status: cur.status }, after: { status: "payment_failed", failureReason: failure } };
    }
    const [row] = await tx
      .update(refundRequests)
      .set({ status: "paid", providerRefundId: issued.refundId, paidToPaymentMethodToken: issued.paymentMethodToken, paidAt: new Date(), failureReason: null })
      .where(eq(refundRequests.id, id))
      .returning();
    return {
      result: summary(row!),
      before: { status: cur.status },
      after: { status: "paid", providerRefundId: issued.refundId, amountCents: issued.amountCents, paidTo: maskCard(charge.last4) },
    };
  });
}

export type RefundView = {
  id: string;
  chargeId: string;
  customerName: string;
  amountCents: number;
  currency: string;
  reason: string;
  status: RefundStatus;
  requiredApprovals: number;
  approvals: number;
  card: string;
  createdBy: { id: string; name: string };
  createdAt: string;
  providerRefundId: string | null;
  paidAt: string | null;
  failureReason: string | null;
};

export type RefundDetail = RefundView & {
  chargeAmountCents: number;
  decisions: { approverId: string; approverName: string; decision: "approve" | "reject"; reason: string | null; at: string }[];
};

const refundSelect = {
  refund: refundRequests,
  customerName: charges.customerName,
  last4: charges.last4,
  chargeAmountCents: charges.amountCents,
  creatorName: users.name,
};

type RefundJoinRow = { refund: RefundRow; customerName: string; last4: string; chargeAmountCents: number; creatorName: string };

function toView(r: RefundJoinRow, approvalCount: number): RefundView {
  return {
    id: r.refund.id,
    chargeId: r.refund.chargeId,
    customerName: r.customerName,
    amountCents: r.refund.amountCents,
    currency: r.refund.currency,
    reason: r.refund.reason,
    status: r.refund.status,
    requiredApprovals: r.refund.requiredApprovals,
    approvals: approvalCount,
    card: maskCard(r.last4),
    createdBy: { id: r.refund.createdBy, name: r.creatorName },
    createdAt: r.refund.createdAt.toISOString(),
    providerRefundId: r.refund.providerRefundId,
    paidAt: r.refund.paidAt?.toISOString() ?? null,
    failureReason: r.refund.failureReason,
  };
}

export async function getRefund(user: User | null, id: string): Promise<RefundDetail> {
  const db = getDb();
  const [row] = await db
    .select(refundSelect)
    .from(refundRequests)
    .innerJoin(charges, eq(charges.id, refundRequests.chargeId))
    .innerJoin(users, eq(users.id, refundRequests.createdBy))
    .where(eq(refundRequests.id, id));
  await authorize(user, "refund.view", { type: ENTITY, id, ownerId: row?.refund.createdBy });
  if (!row) throw new NotFoundError("Refund not found");
  const state = await approvals.state(db, subjectOf(row.refund));
  const approverIds = state.decisions.map((d) => d.approverId);
  const names = approverIds.length
    ? new Map((await db.select({ id: users.id, name: users.name }).from(users).where(inArray(users.id, approverIds))).map((u) => [u.id, u.name]))
    : new Map<string, string>();
  return {
    ...toView(row, state.approvals),
    chargeAmountCents: row.chargeAmountCents,
    decisions: state.decisions.map((d) => ({
      approverId: d.approverId,
      approverName: names.get(d.approverId) ?? d.approverId,
      decision: d.decision,
      reason: d.reason,
      at: d.at.toISOString(),
    })),
  };
}

export const refundGridSpec = {
  sortable: ["createdAt", "amountCents", "status", "customerName"],
  filterable: { status: "eq", chargeId: "eq", customerName: "contains" },
  defaultSort: "createdAt",
  defaultDir: "desc",
  pageSize: 20,
} as const satisfies GridSpec;

export { refundStatuses };

export async function listRefunds(user: User | null, params: GridParams): Promise<{ rows: RefundView[]; total: number }> {
  const actor = await authorize(user, "refund.list");
  const db = getDb();
  const scope: SQL | undefined = can(actor, "refund.view_all") ? undefined : eq(refundRequests.createdBy, actor.id);
  const q = gridQuery(
    params,
    {
      createdAt: refundRequests.createdAt,
      amountCents: refundRequests.amountCents,
      status: refundRequests.status,
      chargeId: refundRequests.chargeId,
      customerName: charges.customerName,
    },
    scope,
  );
  const base = db
    .select(refundSelect)
    .from(refundRequests)
    .innerJoin(charges, eq(charges.id, refundRequests.chargeId))
    .innerJoin(users, eq(users.id, refundRequests.createdBy));
  const [rows, [countRow]] = await Promise.all([
    base.where(q.where).orderBy(q.orderBy, refundRequests.id).limit(q.limit).offset(q.offset),
    db
      .select({ n: sql<number>`count(*)::int` })
      .from(refundRequests)
      .innerJoin(charges, eq(charges.id, refundRequests.chargeId))
      .where(q.where),
  ]);
  const counts = await approvals.counts(db, ENTITY, rows.map((r) => r.refund.id));
  return { rows: rows.map((r) => toView(r, counts.get(r.refund.id) ?? 0)), total: countRow?.n ?? 0 };
}

export const chargeGridSpec = {
  sortable: ["createdAt", "customerName", "amountCents", "remainingCents"],
  filterable: { customerName: "contains", id: "eq" },
  defaultSort: "createdAt",
  defaultDir: "desc",
  pageSize: 10,
} as const satisfies GridSpec;

export type ChargeOption = {
  id: string;
  customerName: string;
  amountCents: number;
  remainingCents: number;
  currency: string;
  card: string;
  createdAt: string;
};

export async function listChargesForRefund(user: User | null, params: GridParams): Promise<{ rows: ChargeOption[]; total: number }> {
  await authorize(user, "refund.create");
  const db = getDb();
  const statuses = sql.join(reservingStatuses.map((s) => sql`${s}`), sql`, `);
  const remaining = sql<number>`(${charges.amountCents} - coalesce((select sum(r.amount_cents) from refund_requests r where r.charge_id = ${charges.id} and r.status in (${statuses})), 0))::int`;
  const q = gridQuery(params, {
    createdAt: charges.createdAt,
    customerName: charges.customerName,
    amountCents: charges.amountCents,
    remainingCents: remaining,
    id: charges.id,
  });
  const [rows, total] = await Promise.all([
    db
      .select({
        id: charges.id,
        customerName: charges.customerName,
        amountCents: charges.amountCents,
        remainingCents: remaining,
        currency: charges.currency,
        last4: charges.last4,
        createdAt: charges.createdAt,
      })
      .from(charges)
      .where(q.where)
      .orderBy(q.orderBy, charges.id)
      .limit(q.limit)
      .offset(q.offset),
    db.$count(charges, q.where),
  ]);
  return {
    rows: rows.map(({ last4, createdAt, ...r }) => ({ ...r, card: maskCard(last4), createdAt: createdAt.toISOString() })),
    total,
  };
}
