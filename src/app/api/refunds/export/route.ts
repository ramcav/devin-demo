import { exportRefunds } from "@/apps/refunds/service";
import { toCsv } from "@/platform/csv";
import { apiRoute } from "@/platform/http";

export const dynamic = "force-dynamic";

export const GET = apiRoute(async (req, user) => {
  const { filters, header, rows } = await exportRefunds(user, Object.fromEntries(new URL(req.url).searchParams));
  const name = ["refunds", filters.from, filters.to, filters.status].filter(Boolean).join("_");
  return new Response(toCsv(header, rows), {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="${name}.csv"`,
      "cache-control": "no-store",
    },
  });
});
