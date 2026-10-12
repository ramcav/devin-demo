import { randomUUID } from "node:crypto";
import { redirect } from "next/navigation";
import { getCurrentUser } from "./auth";
import { AppError } from "./errors";
import type { User } from "./ports/auth";
import { withRequestContext } from "./request-context";

/** For server components: the signed-in user, or a redirect to the login page. */
export async function requirePageUser(): Promise<User> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

export type ActionResult<T> = { ok: true; value: T } | { ok: false; error: string; status: number };

/** For server actions: resolves the user and request id, and turns domain errors into a result the UI can show. */
export async function runAction<T>(fn: (user: User | null) => Promise<T>): Promise<ActionResult<T>> {
  return withRequestContext(randomUUID(), async () => {
    try {
      return { ok: true as const, value: await fn(await getCurrentUser()) };
    } catch (err) {
      if (err instanceof AppError) return { ok: false as const, error: err.message, status: err.status };
      throw err;
    }
  });
}
