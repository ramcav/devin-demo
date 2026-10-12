import { proposeKycDecision, type ProposeKycDecisionInput } from "@/apps/kyc/service";
import { apiRoute } from "@/platform/http";

export const dynamic = "force-dynamic";

export const POST = apiRoute<{ id: string }>(async (req, user, { id }) => {
  const body: unknown = await req.json().catch(() => null);
  return proposeKycDecision(user, id, body as ProposeKycDecisionInput);
});
