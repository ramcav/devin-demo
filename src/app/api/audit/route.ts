import { auditGridSpec, listAuditLog } from "@/platform/audit-service";
import { parseGridParams } from "@/platform/grid";
import { apiRoute } from "@/platform/http";

export const dynamic = "force-dynamic";

export const GET = apiRoute(async (req, user) => {
  const sp = Object.fromEntries(new URL(req.url).searchParams);
  return listAuditLog(user, parseGridParams(sp, auditGridSpec));
});
