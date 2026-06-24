import { NextResponse } from "next/server";
import { fetchWeather } from "@/lib/weather";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const lat = parseFloat(url.searchParams.get("lat") ?? "");
  const lon = parseFloat(url.searchParams.get("lon") ?? "");
  if (!Number.isFinite(lat) || lat < -90 || lat > 90) {
    return NextResponse.json({ error: "invalid lat" }, { status: 400 });
  }
  if (!Number.isFinite(lon) || lon < -180 || lon > 180) {
    return NextResponse.json({ error: "invalid lon" }, { status: 400 });
  }
  const weather = await fetchWeather(lat, lon);
  return NextResponse.json({ weather });
}
