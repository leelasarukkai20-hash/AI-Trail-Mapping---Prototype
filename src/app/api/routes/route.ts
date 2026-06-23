import { NextResponse } from "next/server";
import { listRoutes } from "@/lib/routes";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ routes: listRoutes() });
}
