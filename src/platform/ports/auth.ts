import type { Role } from "../db/schema";

export type { Role };

export type User = {
  id: string;
  name: string;
  email: string;
  role: Role;
};

/** Minimal cookie access the auth adapters need; backed by Next's cookie store or a request's Cookie header. */
export interface CookieJar {
  get(name: string): string | undefined;
  set(name: string, value: string, options: { maxAgeSeconds: number }): void;
  delete(name: string): void;
}

export interface UserDirectory {
  findById(id: string): Promise<User | null>;
}

/** Auth port: who is the current user. Swap the adapter (mock → Entra ID/OIDC) without touching app code. */
export interface AuthPort {
  getCurrentUser(): Promise<User | null>;
  signIn(userId: string): Promise<User>;
  signOut(): Promise<void>;
}

export class UnknownUserError extends Error {
  constructor(userId: string) {
    super(`Unknown user: ${userId}`);
    this.name = "UnknownUserError";
  }
}
