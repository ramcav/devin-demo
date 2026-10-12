import { kycGridSpec, listKycCases } from "@/apps/kyc/service";
import { parseGridParams } from "@/platform/grid";
import { apiRoute } from "@/platform/http";

export const dynamic = "force-dynamic";

export const GET = apiRoute(async (req, user) =>
  listKycCases(user, parseGridParams(Object.fromEntries(new URL(req.url).searchParams), kycGridSpec)),
);
