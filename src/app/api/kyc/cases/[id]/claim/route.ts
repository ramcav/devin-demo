import { claimKycCase } from "@/apps/kyc/service";
import { apiRoute } from "@/platform/http";

export const dynamic = "force-dynamic";

export const POST = apiRoute<{ id: string }>(async (_req, user, { id }) => claimKycCase(user, id));
