import { mockPaymentsProvider } from "@/platform/adapters/payments/mock-provider";
import { providerError } from "../respond";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => ({}))) as { charge?: unknown; amount?: unknown };
    const refund = await mockPaymentsProvider().createRefund({
      charge: body.charge,
      amount: body.amount,
      idempotencyKey: req.headers.get("idempotency-key"),
    });
    return Response.json(refund);
  } catch (err) {
    return providerError(err);
  }
}
