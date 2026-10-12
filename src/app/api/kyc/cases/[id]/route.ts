import { getKycCase } from "@/apps/kyc/service";
import { apiRoute } from "@/platform/http";

export const dynamic = "force-dynamic";

export const GET = apiRoute<{ id: string }>(async (_req, user, { id }) => getKycCase(user, id));
