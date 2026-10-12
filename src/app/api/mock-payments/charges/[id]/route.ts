import { mockPaymentsProvider } from "@/platform/adapters/payments/mock-provider";
import { providerError } from "../../respond";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    return Response.json(await mockPaymentsProvider().getCharge((await params).id));
  } catch (err) {
    return providerError(err);
  }
}
