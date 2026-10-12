import { describe, expect, it } from "vitest";
import { getDb } from "@/platform/db/client";
import { users } from "@/platform/db/schema";
import { gridQuery, MAX_PAGE_SIZE, parseGridParams, type GridSpec } from "@/platform/grid";

const spec = {
  sortable: ["name", "role"],
  filterable: { role: "eq", name: "contains" },
  defaultSort: "name",
  defaultDir: "asc",
  pageSize: 3,
} as const satisfies GridSpec;

const columns = { name: users.name, role: users.role };

async function run(sp: Record<string, string>) {
  const q = gridQuery(parseGridParams(sp, spec), columns);
  const db = getDb();
  const rows = await db.select().from(users).where(q.where).orderBy(q.orderBy).limit(q.limit).offset(q.offset);
  return { rows, total: await db.$count(users, q.where) };
}

describe("data grid query", () => {
  it("ignores sort columns and filters that are not whitelisted", () => {
    const p = parseGridParams({ sort: "email; drop table users", f_email: "x", pageSize: "100000" }, spec);
    expect(p.sort).toBe("name");
    expect(p.filters).toEqual({});
    expect(p.pageSize).toBe(MAX_PAGE_SIZE);
  });

  it("pages, sorts and filters on the server", async () => {
    const page1 = await run({});
    const page2 = await run({ page: "2" });
    expect(page1.rows).toHaveLength(3);
    expect(page1.total).toBe(10);
    expect(page2.rows[0]!.name > page1.rows[2]!.name).toBe(true);

    const approvers = await run({ f_role: "approver", sort: "name", dir: "desc" });
    expect(approvers.total).toBe(3);
    expect(approvers.rows.map((r) => r.name)).toEqual(["Cleo Approver", "Ben Approver", "Ana Approver"]);

    const contains = await run({ f_name: "requester" });
    expect(contains.total).toBe(2);
  });

  it("treats LIKE wildcards in filters literally", async () => {
    expect((await run({ f_name: "%" })).total).toBe(0);
  });
});
