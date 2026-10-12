import { desc } from "drizzle-orm";
import { getDb } from "./db/client";
import { auditLog } from "./db/schema";
import { gridQuery, type GridParams, type GridSpec } from "./grid";
import { authorize } from "./policy";
import type { User } from "./ports/auth";

export const auditGridSpec = {
  sortable: ["at", "actorId", "action", "entityType", "entityId"],
  filterable: { actorId: "eq", actorRole: "eq", action: "contains", entityType: "eq", entityId: "eq" },
  defaultSort: "at",
  defaultDir: "desc",
  pageSize: 25,
} as const satisfies GridSpec;

const auditColumns = {
  at: auditLog.at,
  actorId: auditLog.actorId,
  actorRole: auditLog.actorRole,
  action: auditLog.action,
  entityType: auditLog.entityType,
  entityId: auditLog.entityId,
};

export async function listAuditLog(user: User | null, params: GridParams) {
  await authorize(user, "audit.view");
  const db = getDb();
  const q = gridQuery(params, auditColumns);
  const [rows, total] = await Promise.all([
    db.select().from(auditLog).where(q.where).orderBy(q.orderBy, desc(auditLog.id)).limit(q.limit).offset(q.offset),
    db.$count(auditLog, q.where),
  ]);
  return { rows, total };
}
