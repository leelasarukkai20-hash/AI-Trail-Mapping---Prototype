import { listRoutes } from "@/lib/routes";
import CurateClient from "./CurateClient";

export const dynamic = "force-dynamic";

export default function CuratePage() {
  const routes = listRoutes();
  const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN ?? "";
  return <CurateClient initialRoutes={routes} mapboxToken={token} />;
}
