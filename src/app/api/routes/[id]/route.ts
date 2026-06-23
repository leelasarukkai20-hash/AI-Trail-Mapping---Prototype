import { NextResponse } from "next/server";
import { getRoute, saveRoute } from "@/lib/routes";
import type { RouteProperties } from "../../../../../route-library/types/route";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const route = getRoute(params.id);
  if (!route) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json({ route });
}

export async function PUT(req: Request, { params }: { params: { id: string } }) {
  let body: { properties?: RouteProperties };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }
  if (!body.properties) {
    return NextResponse.json({ error: "missing 'properties'" }, { status: 400 });
  }
  const result = saveRoute(params.id, body.properties);
  if (!result.ok) {
    return NextResponse.json({ error: "validation failed", problems: result.problems }, { status: 422 });
  }
  return NextResponse.json({ route: result.route });
}
