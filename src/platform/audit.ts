import { getDb, type Tx } from "./db/client";
import { auditLog } from "./db/schema";
import { ApprovalDeniedError } from "./errors";
import type { User } from "./ports/auth";
import { currentRequestId } from "./request-context";

export type AuditEntry = {
  actor: User;
  action: string;
  entityType: string;
  entityId: string;
  before?: unknown;
  after?: unknown;
  reason?: string | null;
};

export type ChangeMeta = { action: string; entityType: string; entityId?: string; reason?: string | null };

export type ChangeResult<T> = {
  result: T;
  entityId?: string;
  action?: string;
  before: unknown;
  after: unknown;
  reason?: string | null;
};

/** Appends one audit row inside the caller's transaction. */
async function record(tx: Tx, entry: AuditEntry): Promise<void> {
  await tx.insert(auditLog).values({
    actorId: entry.actor.id,
    actorRole: entry.actor.role,
    action: entry.action,
    entityType: entry.entityType,
    entityId: entry.entityId,
    before: entry.before ?? null,
    after: entry.after ?? null,
    reason: entry.reason ?? null,
    requestId: currentRequestId(),
  });
}

/** Records a denied attempt in its own transaction, so it survives the rollback of the attempted change. */
async function recordDenied(entry: AuditEntry): Promise<void> {
  await getDb().transaction((tx) => audit.record(tx, entry));
}

/**
 * Runs one state change and its single audit row in one transaction (INV-6).
 * If either fails, both roll back. Approval denials are recorded as `approval.denied` after the rollback.
 */
async function change<T>(actor: User, meta: ChangeMeta, fn: (tx: Tx) => Promise<ChangeResult<T>>): Promise<T> {
  try {
    return await getDb().transaction(async (tx) => {
      const out = await fn(tx);
      const entityId = out.entityId ?? meta.entityId;
      if (!entityId) throw new Error(`audit.change(${meta.action}) needs an entityId`);
      await audit.record(tx, {
        actor,
        action: out.action ?? meta.action,
        entityType: meta.entityType,
        entityId,
        before: out.before,
        after: out.after,
        reason: out.reason ?? meta.reason ?? null,
      });
      return out.result;
    });
  } catch (err) {
    if (err instanceof ApprovalDeniedError && meta.entityId) {
      await audit.recordDenied({
        actor,
        action: "approval.denied",
        entityType: meta.entityType,
        entityId: meta.entityId,
        reason: err.reason,
        after: { attempted: meta.action },
      });
    }
    throw err;
  }
}

export const audit = { record, recordDenied, change };
