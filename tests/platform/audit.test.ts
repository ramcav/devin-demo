import { eq } from "drizzle-orm";
import { pgTable, text } from "drizzle-orm/pg-core";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { audit } from "@/platform/audit";
import { getDb, getSql } from "@/platform/db/client";
import { withRequestContext } from "@/platform/request-context";
import { auditRowsFor, uniqueId, users } from "../helpers";

const widgets = pgTable("test_widgets", { id: text("id").primaryKey(), name: text("name").notNull() });

async function widget(id: string) {
  const [row] = await getDb().select().from(widgets).where(eq(widgets.id, id));
  return row ?? null;
}

function createWidget(id: string, name = "first") {
  return audit.change(users.requester, { action: "widget.create", entityType: "widget", entityId: id }, async (tx) => {
    const [row] = await tx.insert(widgets).values({ id, name }).returning();
    return { result: row, before: null, after: row };
  });
}

beforeAll(async () => {
  await getSql()`create table if not exists test_widgets (id text primary key, name text not null)`;
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("audit log", () => {
  it("INV-6: every state change writes exactly one audit row, with actor, before/after and request id", async () => {
    const id = uniqueId("w");
    await withRequestContext("req-123", () => createWidget(id));
    await audit.change(users.requester, { action: "widget.rename", entityType: "widget", entityId: id }, async (tx) => {
      const before = await tx.select().from(widgets).where(eq(widgets.id, id));
      const [after] = await tx.update(widgets).set({ name: "second" }).where(eq(widgets.id, id)).returning();
      return { result: after, before: before[0], after };
    });

    const rows = await auditRowsFor("widget", id);
    expect(rows.map((r) => r.action)).toEqual(["widget.create", "widget.rename"]);
    expect(rows[0]).toMatchObject({
      actorId: users.requester.id,
      actorRole: "requester",
      before: null,
      after: { id, name: "first" },
      requestId: "req-123",
    });
    expect(rows[1]).toMatchObject({ before: { name: "first" }, after: { name: "second" } });
  });

  it("INV-6: if the audit write fails, the state change is rolled back", async () => {
    const id = uniqueId("w");
    vi.spyOn(audit, "record").mockRejectedValueOnce(new Error("audit store down"));
    await expect(createWidget(id)).rejects.toThrow("audit store down");
    expect(await widget(id)).toBeNull();
    expect(await auditRowsFor("widget", id)).toHaveLength(0);
  });

  it("INV-6: if the state change fails, no audit row is written", async () => {
    const id = uniqueId("w");
    await createWidget(id);
    await expect(createWidget(id)).rejects.toThrow();
    expect(await auditRowsFor("widget", id)).toHaveLength(1);
  });

  it("INV-6: audit.record writes in the caller's transaction", async () => {
    const id = uniqueId("w");
    await expect(
      getDb().transaction(async (tx) => {
        await audit.record(tx, { actor: users.requester, action: "widget.touch", entityType: "widget", entityId: id });
        throw new Error("abort");
      }),
    ).rejects.toThrow("abort");
    expect(await auditRowsFor("widget", id)).toHaveLength(0);
  });

  it("INV-7: UPDATE on audit_log fails at the database level", async () => {
    const id = uniqueId("w");
    await createWidget(id);
    await expect(getSql()`update audit_log set action = 'tampered' where entity_id = ${id}`).rejects.toThrow(/append-only/);
    expect((await auditRowsFor("widget", id))[0]?.action).toBe("widget.create");
  });

  it("INV-7: DELETE on audit_log fails at the database level", async () => {
    const id = uniqueId("w");
    await createWidget(id);
    await expect(getSql()`delete from audit_log where entity_id = ${id}`).rejects.toThrow(/append-only/);
    expect(await auditRowsFor("widget", id)).toHaveLength(1);
  });

  it("INV-7: TRUNCATE on audit_log fails at the database level", async () => {
    await expect(getSql()`truncate audit_log`).rejects.toThrow(/append-only/);
  });
});
