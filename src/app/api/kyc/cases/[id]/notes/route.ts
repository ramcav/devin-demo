import { addKycNote } from "@/apps/kyc/service";
import { apiRoute } from "@/platform/http";

export const dynamic = "force-dynamic";

export const POST = apiRoute<{ id: string }>(async (req, user, { id }) => {
  const body = (await req.json().catch(() => ({}))) as { body?: unknown };
  return Response.json(await addKycNote(user, id, typeof body.body === "string" ? body.body : ""), { status: 201 });
});
