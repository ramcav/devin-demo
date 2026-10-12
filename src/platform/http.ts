import { NextResponse } from "next/server";
import { userFromRequest } from "./auth";
import { AppError, UnauthenticatedError } from "./errors";
import type { User } from "./ports/auth";
import { withRequestContext } from "./request-context";

export function errorResponse(err: unknown): Response {
  if (err instanceof AppError) {
    return NextResponse.json({ error: err.code, message: err.message }, { status: err.status });
  }
  console.error(err);
  return NextResponse.json({ error: "internal_error", message: "Something went wrong" }, { status: 500 });
}

type RouteContext<P> = { params: Promise<P> };

/** Route handler wrapper: resolves the user (401 if none), sets the request id, maps domain errors to HTTP. */
export function apiRoute<P = Record<string, never>>(
  fn: (req: Request, user: User, params: P) => Promise<unknown>,
): (req: Request, ctx: RouteContext<P>) => Promise<Response> {
  return (req, ctx) =>
    withRequestContext(req.headers.get("x-request-id"), async () => {
      try {
        const user = await userFromRequest(req);
        if (!user) throw new UnauthenticatedError();
        const params = ctx?.params ? await ctx.params : ({} as P);
        const out = await fn(req, user, params);
        return out instanceof Response ? out : NextResponse.json(out);
      } catch (err) {
        return errorResponse(err);
      }
    });
}
