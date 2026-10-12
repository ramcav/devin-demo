import type { Role, User } from "./ports/auth";

export type Action = "audit.view";

export type Resource = { type: string; id?: string; ownerId?: string };

type Rule = true | ((user: User, resource: Resource | undefined) => boolean);

export const policy: Record<Action, Partial<Record<Role, Rule>>> = {
  "audit.view": { auditor: true, compliance: true },
};

export function can(_user: User | null, _action: Action, _resource?: Resource): boolean {
  throw new Error("not implemented");
}

export async function authorize(_user: User | null, _action: Action, _resource?: Resource): Promise<User> {
  throw new Error("not implemented");
}
