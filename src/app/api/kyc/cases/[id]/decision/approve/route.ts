import { decideKycProposal } from "@/apps/kyc/service";
import { apiRoute } from "@/platform/http";

export const dynamic = "force-dynamic";

export const POST = apiRoute<{ id: string }>(async (req, user, { id }) => {
  const body = (await req.json().catch(() => ({}))) as { reason?: unknown };
  return decideKycProposal(user, id, "approve", typeof body.reason === "string" ? body.reason : null);
});
