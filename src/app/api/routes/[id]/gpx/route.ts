import { NextResponse } from "next/server";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

export const dynamic = "force-dynamic";

const GPX_DIR = join(process.cwd(), "route-library", "gpx");
const ID_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;

// Some GPX files in the library have trailing spaces or extra dashes in their
// filename that don't match the geojson id. Build a normalized lookup map once
// so a stable id like "ninja-hawk" finds "ninja-hawk .gpx".
const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

let idToFile: Map<string, string> | null = null;
function getIdToFile(): Map<string, string> {
  if (idToFile) return idToFile;
  const m = new Map<string, string>();
  for (const f of readdirSync(GPX_DIR)) {
    if (!f.toLowerCase().endsWith(".gpx")) continue;
    const base = f.slice(0, -4);
    m.set(normalize(base), f);
  }
  idToFile = m;
  return m;
}

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  if (!ID_RE.test(params.id)) {
    return NextResponse.json({ error: "invalid id" }, { status: 400 });
  }
  const file = getIdToFile().get(params.id);
  if (!file) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  const body = readFileSync(join(GPX_DIR, file));
  return new NextResponse(body, {
    headers: {
      "content-type": "application/gpx+xml",
      "content-disposition": `attachment; filename="${params.id}.gpx"`,
    },
  });
}
