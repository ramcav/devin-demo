import { createMockAuthAdapter } from "@/platform/adapters/auth/mock";
import { dbUserDirectory } from "@/platform/auth";
import { authPortContract } from "../ports/auth.contract";

const ttlSeconds = 60 * 60;

authPortContract(
  "mock",
  ({ jar, now }) => createMockAuthAdapter({ secret: "contract-test-secret", jar, users: dbUserDirectory, now, ttlSeconds }),
  { sessionTtlMs: ttlSeconds * 1000 },
);
