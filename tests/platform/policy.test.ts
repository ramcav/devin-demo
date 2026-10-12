import { describe, expect, it } from "vitest";
import { roles } from "@/platform/db/schema";
import { ForbiddenError, UnauthenticatedError } from "@/platform/errors";
import { authorize, can, policy, type Action } from "@/platform/policy";
import { auditRowsFor, users } from "../helpers";

describe("policy", () => {
  it("INV-8: default deny for unknown actions and for roles without a grant", () => {
    expect(can(users.admin, "audit.view")).toBe(false);
    expect(can(users.auditor, "does.not.exist" as Action)).toBe(false);
    expect(can(null, "audit.view")).toBe(false);
  });

  it("INV-8: every grant in the policy names a known role", () => {
    for (const grants of Object.values(policy)) {
      for (const role of Object.keys(grants)) expect(roles).toContain(role);
    }
  });

  it("INV-8: authorize() throws Forbidden and records authz.denied for a role without the grant", async () => {
    await expect(authorize(users.requester2, "audit.view")).rejects.toBeInstanceOf(ForbiddenError);
    const rows = await auditRowsFor("action", "audit.view");
    expect(rows.at(-1)).toMatchObject({ action: "authz.denied", actorId: users.requester2.id, actorRole: "requester" });
  });

  it("INV-8: authorize() throws Unauthenticated when there is no user", async () => {
    await expect(authorize(null, "audit.view")).rejects.toBeInstanceOf(UnauthenticatedError);
  });

  it("authorize() returns the user when allowed", async () => {
    await expect(authorize(users.auditor, "audit.view")).resolves.toEqual(users.auditor);
  });
});
