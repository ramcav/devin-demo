import { describe, expect, it, vi } from "vitest";
import { parseDecision } from "@/platform/decisions";
import { ValidationError } from "@/platform/errors";
import { runAction } from "@/platform/session";

vi.mock("@/platform/auth", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/platform/auth")>()),
  getCurrentUser: async () => null,
}));

describe("parseDecision", () => {
  it.each(["approve", "reject"] as const)("accepts exactly %j", (value) => {
    expect(parseDecision(value)).toBe(value);
  });

  it.each([null, undefined, "", "approved", "Approve", "REJECT", " approve", "approve ", "yes", 1, true, ["approve"], { decision: "approve" }])(
    "rejects %j with a 400",
    (value) => {
      expect(() => parseDecision(value)).toThrow(ValidationError);
      try {
        parseDecision(value);
      } catch (err) {
        expect(err).toMatchObject({ status: 400, code: "validation_failed" });
      }
    },
  );

  it("surfaces as a 400 result from a server action", async () => {
    const res = await runAction(async () => parseDecision("approved"));
    expect(res).toEqual({ ok: false, status: 400, error: 'Decision must be "approve" or "reject"' });
  });
});
