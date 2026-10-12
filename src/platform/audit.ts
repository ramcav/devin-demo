import type { Tx } from "./db/client";
import type { User } from "./ports/auth";

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

async function record(_tx: Tx, _entry: AuditEntry): Promise<void> {
  throw new Error("not implemented");
}

async function recordDenied(_entry: AuditEntry): Promise<void> {
  throw new Error("not implemented");
}

async function change<T>(_actor: User, _meta: ChangeMeta, _fn: (tx: Tx) => Promise<ChangeResult<T>>): Promise<T> {
  throw new Error("not implemented");
}

export const audit = { record, recordDenied, change };
