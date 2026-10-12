import { escalateKycCase } from "@/apps/kyc/service";
import { apiRoute } from "@/platform/http";

export const dynamic = "force-dynamic";

export const POST = apiRoute<{ id: string }>(async (req, user, { id }) => {
  const body = (await req.json().catch(() => ({}))) as { note?: unknown };
  return escalateKycCase(user, id, typeof body.note === "string" ? body.note : "");
});
