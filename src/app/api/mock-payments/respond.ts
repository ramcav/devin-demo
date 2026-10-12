import { ProviderHttpError } from "@/platform/adapters/payments/mock-provider";

export function providerError(err: unknown): Response {
  if (err instanceof ProviderHttpError) {
    return Response.json({ error: { code: err.code, message: err.message } }, { status: err.status });
  }
  console.error(err);
  return Response.json({ error: { code: "internal", message: "Mock provider error" } }, { status: 500 });
}
