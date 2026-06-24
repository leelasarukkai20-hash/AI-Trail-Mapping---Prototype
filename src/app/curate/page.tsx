import { listRoutes } from "@/lib/routes";
import CurateClient from "./CurateClient";

export const dynamic = "force-dynamic";

export default function CuratePage() {
  const routes = listRoutes();
  return <CurateClient initialRoutes={routes} />;
}
