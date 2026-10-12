import { describe, expect, it } from "vitest";
import { UnknownUserError, type AuthPort, type CookieJar } from "@/platform/ports/auth";
import { memoryJar, users } from "../../helpers";

export type AuthAdapterFactory = (opts: { jar: CookieJar; now: () => number }) => AuthPort;

/** Shared contract every auth adapter must pass. */
export function authPortContract(name: string, make: AuthAdapterFactory, opts: { sessionTtlMs: number }) {
  describe(`auth port contract: ${name}`, () => {
    const clock = () => {
      let t = Date.UTC(2026, 0, 1);
      return { now: () => t, advance: (ms: number) => (t += ms) };
    };

    it("returns no user without a session", async () => {
      const auth = make({ jar: memoryJar(), now: Date.now });
      expect(await auth.getCurrentUser()).toBeNull();
    });

    it("signs in a known user and returns them as the current user", async () => {
      const jar = memoryJar();
      const auth = make({ jar, now: Date.now });
      expect(await auth.signIn(users.approverA.id)).toEqual(users.approverA);
      expect(await make({ jar, now: Date.now }).getCurrentUser()).toEqual(users.approverA);
    });

    it("rejects an unknown user with UnknownUserError", async () => {
      const auth = make({ jar: memoryJar(), now: Date.now });
      await expect(auth.signIn("u_does_not_exist")).rejects.toBeInstanceOf(UnknownUserError);
    });

    it("ignores a tampered session", async () => {
      const jar = memoryJar();
      const auth = make({ jar, now: Date.now });
      await auth.signIn(users.requester.id);
      for (const [k, v] of jar.values) jar.values.set(k, v.replace(users.requester.id, users.auditor.id));
      expect(await auth.getCurrentUser()).toBeNull();
    });

    it("expires sessions", async () => {
      const jar = memoryJar();
      const c = clock();
      const auth = make({ jar, now: c.now });
      await auth.signIn(users.requester.id);
      c.advance(opts.sessionTtlMs + 1000);
      expect(await auth.getCurrentUser()).toBeNull();
    });

    it("signs out", async () => {
      const jar = memoryJar();
      const auth = make({ jar, now: Date.now });
      await auth.signIn(users.requester.id);
      await auth.signOut();
      expect(await auth.getCurrentUser()).toBeNull();
    });
  });
}
