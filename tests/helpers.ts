import { randomUUID } from "node:crypto";
import { and, asc, eq } from "drizzle-orm";
import { createMockAuthAdapter, SESSION_COOKIE } from "@/platform/adapters/auth/mock";
import { dbUserDirectory } from "@/platform/auth";
import { getDb } from "@/platform/db/client";
import { auditLog } from "@/platform/db/schema";
import { seedUsers } from "@/platform/db/seed";
import type { CookieJar, User } from "@/platform/ports/auth";

export function user(id: string): User {
  const u = seedUsers.find((s) => s.id === id);
  if (!u) throw new Error(`No seed user ${id}`);
  return u;
}

export const users = {
  requester: user("u_req_1"),
  requester2: user("u_req_2"),
  approverA: user("u_app_1"),
  approverB: user("u_app_2"),
  approverC: user("u_app_3"),
  kycReviewer: user("u_kyc_1"),
  compliance: user("u_cmp_1"),
  auditor: user("u_aud_1"),
  admin: user("u_adm_1"),
};

export function uniqueId(prefix: string): string {
  return `${prefix}_${randomUUID().slice(0, 8)}`;
}

export function memoryJar(): CookieJar & { values: Map<string, string> } {
  const values = new Map<string, string>();
  return {
    values,
    get: (name) => values.get(name),
    set: (name, value) => void values.set(name, value),
    delete: (name) => void values.delete(name),
  };
}

/** A signed session cookie header for the given user, as the mock auth adapter would set it. */
export async function sessionCookie(userId: string): Promise<string> {
  const jar = memoryJar();
  const auth = createMockAuthAdapter({ secret: process.env.SESSION_SECRET!, jar, users: dbUserDirectory });
  await auth.signIn(userId);
  return `${SESSION_COOKIE}=${encodeURIComponent(jar.values.get(SESSION_COOKIE)!)}`;
}

export async function apiRequest(
  path: string,
  init: { method?: string; asUser?: string; body?: unknown } = {},
): Promise<Request> {
  const headers = new Headers({ "content-type": "application/json" });
  if (init.asUser) headers.set("cookie", await sessionCookie(init.asUser));
  return new Request(`http://localhost:3000${path}`, {
    method: init.method ?? "GET",
    headers,
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });
}

export function routeCtx<P>(params: P) {
  return { params: Promise.resolve(params) };
}

export async function auditRowsFor(entityType: string, entityId: string) {
  return getDb()
    .select()
    .from(auditLog)
    .where(and(eq(auditLog.entityType, entityType), eq(auditLog.entityId, entityId)))
    .orderBy(asc(auditLog.id));
}
