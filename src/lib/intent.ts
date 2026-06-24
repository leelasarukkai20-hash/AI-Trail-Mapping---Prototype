import Anthropic from "@anthropic-ai/sdk";
import type { Difficulty, Region, VibeTag } from "../../route-library/types/route";

const REGIONS: Region[] = ["Headlands", "Mill Valley", "Muir Beach", "Stinson Beach", "Other"];
const DIFFICULTIES: Difficulty[] = ["easy", "moderate", "hard", "very-hard"];
const VIBE_TAGS: VibeTag[] = [
  "shaded", "exposed", "ocean-views", "ridgeline", "summit",
  "redwoods", "creek", "waterfall", "wildflowers",
  "technical", "smooth", "steep-climb", "gradual", "rolling",
  "beginner-friendly", "quiet", "popular", "dog-friendly",
];

export type SurfacePreference = "trail" | "fire_road" | "road" | "any";

export interface Intent {
  distance_km?: number;
  distance_tolerance_km?: number;
  min_gain_m?: number;
  max_gain_m?: number;
  surface_preference?: SurfacePreference;
  vibe_tags?: VibeTag[];
  region?: Region;
  difficulty?: Difficulty;
  dogs_allowed?: boolean;
}

const INTENT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    distance_km: {
      type: ["number", "null"],
      description: "Target distance in kilometers. Convert miles to km (1 mi = 1.609 km). Null if unspecified.",
    },
    distance_tolerance_km: {
      type: ["number", "null"],
      description: "Acceptable +/- tolerance in km around distance_km. Default ~3km for explicit targets.",
    },
    min_gain_m: {
      type: ["number", "null"],
      description: "Minimum elevation gain in meters. Set when user wants climbing/vert. Convert feet to meters (1 ft = 0.3048 m).",
    },
    max_gain_m: {
      type: ["number", "null"],
      description: "Maximum elevation gain in meters. Set when user wants flat/easy.",
    },
    surface_preference: {
      anyOf: [
        { type: "string", enum: ["trail", "fire_road", "road", "any"] },
        { type: "null" },
      ],
      description: "Singletrack/trail, fire road, paved road, or any. Use 'trail' for 'singletrack'.",
    },
    vibe_tags: {
      type: "array",
      items: { type: "string", enum: VIBE_TAGS },
      description: "Vibe tags matching the prompt. Examples: 'ocean views' -> ['ocean-views']; 'shady redwoods' -> ['shaded','redwoods']; 'with my dog' -> ['dog-friendly'].",
    },
    region: {
      anyOf: [
        { type: "string", enum: REGIONS },
        { type: "null" },
      ],
      description: "Marin region if specified. 'near Stinson' -> 'Stinson Beach'.",
    },
    difficulty: {
      anyOf: [
        { type: "string", enum: DIFFICULTIES },
        { type: "null" },
      ],
      description: "Difficulty if specified. 'easy run' -> 'easy'; 'challenging' -> 'hard'; 'crusher' -> 'very-hard'.",
    },
    dogs_allowed: {
      type: ["boolean", "null"],
      description: "True if user wants dog-friendly route. Null otherwise.",
    },
  },
  required: [
    "distance_km", "distance_tolerance_km", "min_gain_m", "max_gain_m",
    "surface_preference", "vibe_tags", "region", "difficulty", "dogs_allowed",
  ],
} as const;

const SYSTEM_PROMPT = `You are a Marin trail-run intent parser. Convert a runner's natural-language prompt into structured filters.

Be conservative: only set a field if the user explicitly or strongly implied it. Leave unspecified fields as null.
Convert all units to metric (miles->km, feet->meters).
Vibe tags must come from the fixed list; do not invent new ones.`;

let client: Anthropic | null = null;
function getClient(): Anthropic {
  if (!client) client = new Anthropic();
  return client;
}

export async function parseIntent(prompt: string): Promise<Intent> {
  const response = await getClient().messages.create({
    model: "claude-haiku-4-5",
    max_tokens: 1024,
    system: SYSTEM_PROMPT,
    output_config: { format: { type: "json_schema", schema: INTENT_SCHEMA } },
    messages: [{ role: "user", content: prompt }],
  });

  const block = response.content.find((b) => b.type === "text");
  if (!block || block.type !== "text") {
    throw new Error("No text block in intent response");
  }

  const raw = JSON.parse(block.text) as Record<string, unknown>;
  const intent: Intent = {};
  if (typeof raw.distance_km === "number") intent.distance_km = raw.distance_km;
  if (typeof raw.distance_tolerance_km === "number") intent.distance_tolerance_km = raw.distance_tolerance_km;
  if (typeof raw.min_gain_m === "number") intent.min_gain_m = raw.min_gain_m;
  if (typeof raw.max_gain_m === "number") intent.max_gain_m = raw.max_gain_m;
  if (typeof raw.surface_preference === "string") intent.surface_preference = raw.surface_preference as SurfacePreference;
  if (Array.isArray(raw.vibe_tags) && raw.vibe_tags.length > 0) intent.vibe_tags = raw.vibe_tags as VibeTag[];
  if (typeof raw.region === "string") intent.region = raw.region as Region;
  if (typeof raw.difficulty === "string") intent.difficulty = raw.difficulty as Difficulty;
  if (typeof raw.dogs_allowed === "boolean") intent.dogs_allowed = raw.dogs_allowed;
  return intent;
}
