import { can, type Action } from "./policy";
import type { User } from "./ports/auth";

export type AppEntry = { id: string; name: string; description: string; href: string; access: Action };

/** Launcher registry. An app shows up for a user only if the policy grants its access action. */
export const appRegistry: AppEntry[] = [
  { id: "audit", name: "Audit log", description: "Read-only, filterable log of every change", href: "/audit", access: "audit.view" },
];

export function appsFor(user: User | null): AppEntry[] {
  return appRegistry.filter((app) => can(user, app.access));
}
