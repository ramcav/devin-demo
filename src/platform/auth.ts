import { eq } from "drizzle-orm";
import { createMockAuthAdapter } from "./adapters/auth/mock";
import { getDb } from "./db/client";
import { users } from "./db/schema";
import type { AuthPort, CookieJar, User, UserDirectory } from "./ports/auth";

export type { User } from "./ports/auth";

export const dbUserDirectory: UserDirectory = {
  async findById(id) {
    const [row] = await getDb().select().from(users).where(eq(users.id, id)).limit(1);
    return row ?? null;
  },
};

function sessionSecret(): string {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 16) throw new Error("SESSION_SECRET must be set (at least 16 characters)");
  return secret;
}

export function authFor(jar: CookieJar): AuthPort {
  const adapter = process.env.AUTH_ADAPTER ?? "mock";
  switch (adapter) {
    case "mock":
      return createMockAuthAdapter({ secret: sessionSecret(), jar, users: dbUserDirectory });
    default:
      throw new Error(`Unsupported AUTH_ADAPTER: ${adapter}`);
  }
}

/** Read-only jar over a request's Cookie header (route handlers, tests). */
export function requestCookieJar(req: Request): CookieJar {
  const header = req.headers.get("cookie") ?? "";
  const parsed = new Map<string, string>();
  for (const part of header.split(";")) {
    const idx = part.indexOf("=");
    if (idx > 0) parsed.set(part.slice(0, idx).trim(), decodeURIComponent(part.slice(idx + 1).trim()));
  }
  return {
    get: (name) => parsed.get(name),
    set: () => {
      throw new Error("Request cookie jar is read-only");
    },
    delete: () => {
      throw new Error("Request cookie jar is read-only");
    },
  };
}

/** Next.js cookie store (server components and server actions). */
export async function nextCookieJar(): Promise<CookieJar> {
  const { cookies } = await import("next/headers");
  const store = await cookies();
  return {
    get: (name) => store.get(name)?.value,
    set: (name, value, { maxAgeSeconds }) =>
      store.set(name, value, {
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production" && process.env.INSECURE_COOKIES !== "1",
        path: "/",
        maxAge: maxAgeSeconds,
      }),
    delete: (name) => store.delete(name),
  };
}

export async function getCurrentUser(): Promise<User | null> {
  return authFor(await nextCookieJar()).getCurrentUser();
}

export async function userFromRequest(req: Request): Promise<User | null> {
  return authFor(requestCookieJar(req)).getCurrentUser();
}

/** Users offered on the mock login page. A real IdP adapter would not need this. */
export async function mockSignInOptions(): Promise<User[]> {
  return getDb().select().from(users).orderBy(users.role, users.name);
}
