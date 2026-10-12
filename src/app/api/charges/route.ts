import { chargeGridSpec, listChargesForRefund } from "@/apps/refunds/service";
import { parseGridParams } from "@/platform/grid";
import { apiRoute } from "@/platform/http";

export const dynamic = "force-dynamic";

export const GET = apiRoute(async (req, user) =>
  listChargesForRefund(user, parseGridParams(Object.fromEntries(new URL(req.url).searchParams), chargeGridSpec)),
);
