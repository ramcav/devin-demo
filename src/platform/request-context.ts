import { AsyncLocalStorage } from "node:async_hooks";
import { randomUUID } from "node:crypto";

type RequestContext = { requestId: string };

const storage = new AsyncLocalStorage<RequestContext>();

export function withRequestContext<T>(requestId: string | null | undefined, fn: () => Promise<T>): Promise<T> {
  return storage.run({ requestId: requestId || randomUUID() }, fn);
}

export function currentRequestId(): string | null {
  return storage.getStore()?.requestId ?? null;
}
