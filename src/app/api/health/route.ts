import { NextResponse } from "next/server";
import { getSql } from "@/platform/db/client";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await getSql()`select 1`;
    return NextResponse.json({ status: "ok", db: "ok" });
  } catch {
    return NextResponse.json({ status: "degraded", db: "unreachable" }, { status: 503 });
  }
}
