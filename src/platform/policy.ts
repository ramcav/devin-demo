import { audit } from "./audit";
import { ForbiddenError, UnauthenticatedError } from "./errors";
import type { Role, User } from "./ports/auth";

export type Action = "audit.view";

export type Resource = { type: string; id?: string; ownerId?: string };

type Rule = true | ((user: User, resource: Resource | undefined) => boolean);

/** role → allowed actions. Anything not listed is denied. */
export const policy: Record<Action, Partial<Record<Role, Rule>>> = {
  "audit.view": { auditor: true, compliance: true },
};

export function can(user: User | null, action: Action, resource?: Resource): boolean {
  if (!user || !Object.hasOwn(policy, action)) return false;
  const grants = policy[action];
  const rule = Object.hasOwn(grants, user.role) ? grants[user.role] : undefined;
  if (!rule) return false;
  return rule === true || rule(user, resource);
}

/** Call at the top of every server action and route handler. Throws (and audits the denial) unless allowed. */
export async function authorize(user: User | null, action: Action, resource?: Resource): Promise<User> {
  if (!user) throw new UnauthenticatedError();
  if (can(user, action, resource)) return user;
  await audit.recordDenied({
    actor: user,
    action: "authz.denied",
    entityType: resource?.type ?? "action",
    entityId: resource?.id ?? action,
    after: { attempted: action },
  });
  throw new ForbiddenError();
}
