import { createRefund, listRefunds, refundGridSpec } from "@/apps/refunds/service";
import { parseGridParams } from "@/platform/grid";
import { apiRoute } from "@/platform/http";

export const dynamic = "force-dynamic";

export const GET = apiRoute(async (req, user) =>
  listRefunds(user, parseGridParams(Object.fromEntries(new URL(req.url).searchParams), refundGridSpec)),
);

export const POST = apiRoute(async (req, user) => {
  const body: unknown = await req.json().catch(() => null);
  return Response.json(await createRefund(user, body), { status: 201 });
});
