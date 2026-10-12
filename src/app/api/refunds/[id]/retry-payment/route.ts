import { retryRefundPayment } from "@/apps/refunds/service";
import { apiRoute } from "@/platform/http";

export const POST = apiRoute<{ id: string }>(async (_req, user, { id }) => retryRefundPayment(user, id));
