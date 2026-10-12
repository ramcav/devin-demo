import { createHmac, timingSafeEqual } from "node:crypto";
import { UnknownUserError, type AuthPort, type CookieJar, type UserDirectory } from "../../ports/auth";

export const SESSION_COOKIE = "session";
const DEFAULT_TTL_SECONDS = 12 * 60 * 60;

export type MockAuthOptions = {
  secret: string;
  jar: CookieJar;
  users: UserDirectory;
  ttlSeconds?: number;
  now?: () => number;
};

/** Mock identity provider: pick a seeded user, get an HMAC-signed session cookie. No passwords. */
export function createMockAuthAdapter(opts: MockAuthOptions): AuthPort {
  const ttlSeconds = opts.ttlSeconds ?? DEFAULT_TTL_SECONDS;
  const now = opts.now ?? Date.now;
  const sign = (payload: string) => createHmac("sha256", opts.secret).update(payload).digest("base64url");

  function verify(value: string | undefined): string | null {
    if (!value) return null;
    const lastDot = value.lastIndexOf(".");
    if (lastDot < 0) return null;
    const payload = value.slice(0, lastDot);
    const given = Buffer.from(value.slice(lastDot + 1));
    const expected = Buffer.from(sign(payload));
    if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
    const sep = payload.lastIndexOf(".");
    const userId = payload.slice(0, sep);
    const expiresAt = Number(payload.slice(sep + 1));
    if (!userId || !Number.isFinite(expiresAt) || expiresAt <= now()) return null;
    return userId;
  }

  return {
    async getCurrentUser() {
      const userId = verify(opts.jar.get(SESSION_COOKIE));
      return userId ? opts.users.findById(userId) : null;
    },
    async signIn(userId) {
      const user = await opts.users.findById(userId);
      if (!user) throw new UnknownUserError(userId);
      const payload = `${user.id}.${now() + ttlSeconds * 1000}`;
      opts.jar.set(SESSION_COOKIE, `${payload}.${sign(payload)}`, { maxAgeSeconds: ttlSeconds });
      return user;
    },
    async signOut() {
      opts.jar.delete(SESSION_COOKIE);
    },
  };
}
