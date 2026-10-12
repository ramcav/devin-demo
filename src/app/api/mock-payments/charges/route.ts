import { mockPaymentsProvider } from "@/platform/adapters/payments/mock-provider";
import { providerError } from "../respond";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return Response.json({ object: "list", data: await mockPaymentsProvider().listCharges() });
  } catch (err) {
    return providerError(err);
  }
}
