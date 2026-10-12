import { GET as getChargeRoute } from "@/app/api/mock-payments/charges/[id]/route";
import { GET as listChargesRoute } from "@/app/api/mock-payments/charges/route";
import { POST as createRefundRoute } from "@/app/api/mock-payments/refunds/route";
import { createMockHttpPaymentsAdapter } from "@/platform/adapters/payments/mock-http";
import { paymentsPortContract } from "../ports/payments.contract";

const BASE = "http://mock.test/api/mock-payments";

/** Dispatches the adapter's HTTP calls straight to the in-repo mock provider routes (real handlers, test DB). */
const routeFetch: typeof fetch = async (input, init) => {
  const req = new Request(input, init);
  const path = new URL(req.url).pathname.replace("/api/mock-payments", "");
  const handled = (async () => {
    if (req.method === "GET" && path === "/charges") return listChargesRoute();
    const charge = path.match(/^\/charges\/([^/]+)$/);
    if (req.method === "GET" && charge) return getChargeRoute(req, { params: Promise.resolve({ id: charge[1]! }) });
    if (req.method === "POST" && path === "/refunds") return createRefundRoute(req);
    return new Response("not found", { status: 404 });
  })();
  const signal = init?.signal;
  if (!signal) return handled;
  return Promise.race([
    handled,
    new Promise<Response>((_, reject) => {
      if (signal.aborted) reject(signal.reason);
      signal.addEventListener("abort", () => reject(signal.reason), { once: true });
    }),
  ]);
};

process.env.MOCK_PAYMENTS_SLOW_MS = "1000";

paymentsPortContract("mock (HTTP → /api/mock-payments)", () =>
  createMockHttpPaymentsAdapter({ baseUrl: BASE, timeoutMs: 150, retries: 1, fetch: routeFetch }),
);
