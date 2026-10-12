import { decideRefund } from "@/apps/refunds/service";
import { apiRoute } from "@/platform/http";

export const POST = apiRoute<{ id: string }>(async (req, user, { id }) => {
  const body = (await req.json().catch(() => ({}))) as { reason?: unknown };
  return decideRefund(user, id, "reject", typeof body.reason === "string" ? body.reason : null);
});
