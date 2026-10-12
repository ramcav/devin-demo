import type { AuthPort, CookieJar, UserDirectory } from "../../ports/auth";

export const SESSION_COOKIE = "session";

export type MockAuthOptions = {
  secret: string;
  jar: CookieJar;
  users: UserDirectory;
  ttlSeconds?: number;
  now?: () => number;
};

export function createMockAuthAdapter(_opts: MockAuthOptions): AuthPort {
  throw new Error("not implemented");
}
