import { notFound } from "next/navigation";
import { listRoutes } from "@/lib/routes";
import CurateClient from "./CurateClient";

export const dynamic = "force-dynamic";

export default function CuratePage() {
  // /curate is a local founder tool (edits write to route-library/ on disk).
  // It must not be reachable in deployed environments; its write API
  // (PUT /api/routes/[id]) is blocked in production the same way.
  if (process.env.NODE_ENV === "production") notFound();
  const routes = listRoutes();
  return <CurateClient initialRoutes={routes} />;
}
