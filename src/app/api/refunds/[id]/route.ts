import { getRefund } from "@/apps/refunds/service";
import { apiRoute } from "@/platform/http";

export const dynamic = "force-dynamic";

export const GET = apiRoute<{ id: string }>(async (_req, user, { id }) => getRefund(user, id));
