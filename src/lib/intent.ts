import type Anthropic from "@anthropic-ai/sdk";
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
  exclude_vibe_tags?: VibeTag[];
  region?: Region;
  difficulty?: Difficulty;
  dogs_allowed?: boolean;
  time_budget_min?: number;
  out_of_coverage?: boolean;
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
      description: "Maximum elevation gain in meters. Set when user wants flat/easy, or asks to avoid big climbs.",
    },
    surface_preference: {
      anyOf: [{ type: "string", enum: ["trail", "fire_road", "road", "any"] }, { type: "null" }],
      description: "Singletrack/trail, fire road, paved road, or any. Use 'trail' for 'singletrack'.",
    },
    vibe_tags: {
      type: "array",
      items: { type: "string", enum: VIBE_TAGS },
      description: "Vibe tags the user WANTS. 'ocean views' -> ['ocean-views']; 'shady redwoods' -> ['shaded','redwoods']; 'with my dog' -> ['dog-friendly'].",
    },
    exclude_vibe_tags: {
      type: "array",
      items: { type: "string", enum: VIBE_TAGS },
      description: "Vibe tags the user wants to AVOID. 'avoid exposed ridges' -> ['exposed']; 'nothing too technical' -> ['technical']. Empty array if none.",
    },
    region: {
      anyOf: [{ type: "string", enum: REGIONS }, { type: "null" }],
      description: "Marin region if specified. 'near Stinson' -> 'Stinson Beach'. Null if no Marin region is named.",
    },
    difficulty: {
      anyOf: [{ type: "string", enum: DIFFICULTIES }, { type: "null" }],
      description: "Difficulty if specified. 'easy run' -> 'easy'; 'challenging' -> 'hard'; 'crusher' -> 'very-hard'.",
    },
    dogs_allowed: {
      type: ["boolean", "null"],
      description: "True if user wants a dog-friendly route. Null otherwise.",
    },
    time_budget_min: {
      type: ["number", "null"],
      description: "Minutes available, if the user gives a time instead of a distance. 'about an hour' -> 60; '90 minutes' -> 90. Null if they gave a distance or no time.",
    },
    out_of_coverage: {
      type: ["boolean", "null"],
      description: "True ONLY if the prompt clearly asks for trails in a place outside Marin County, California (e.g., Tahoe, Yosemite, another state). Null/false for Marin or unspecified locations.",
    },
  },
  required: [
    "distance_km", "distance_tolerance_km", "min_gain_m", "max_gain_m",
    "surface_preference", "vibe_tags", "exclude_vibe_tags", "region", "difficulty",
    "dogs_allowed", "time_budget_min", "out_of_coverage",
  ],
} as const;

const SYSTEM_PROMPT = `You are a Marin trail-run intent parser. Convert a runner's natural-language prompt into structured filters.

Be conservative: only set a field if the user explicitly or strongly implied it. Leave unspecified fields null (empty array for tag lists).
Convert all units to metric (miles->km, feet->meters).
Vibe tags must come from the fixed list; do not invent new ones.
Negation: things to AVOID go in exclude_vibe_tags, not vibe_tags ("avoid exposed" -> exclude_vibe_tags ['exposed']). "no big climbs" -> a low max_gain_m.
Time vs distance: if the user gives a time budget instead of a distance, set time_budget_min and leave distance_km null.
Coverage: this app only covers Marin County, CA. If the prompt clearly asks for another area (Tahoe, Yosemite, etc.), set out_of_coverage true.`;

// Default trail pace used to turn a time budget into a distance when we don't
// yet have the user's Strava average.
export const DEFAULT_TRAIL_PACE_MIN_PER_KM = 6.5;

/** Fill distance_km from a time budget when distance wasn't given. */
export function withDerivedDistance(intent: Intent, avgPaceMinPerKm: number | null): Intent {
  if (intent.distance_km == null && intent.time_budget_min != null) {
    const pace = avgPaceMinPerKm ?? DEFAULT_TRAIL_PACE_MIN_PER_KM;
    return {
      ...intent,
      distance_km: Math.round((intent.time_budget_min / pace) * 10) / 10,
      distance_tolerance_km: intent.distance_tolerance_km ?? 4,
    };
  }
  return intent;
}

let client: Anthropic | null = null;
async function getClient(): Promise<Anthropic> {
  if (!client) {
    const { default: AnthropicClient } = await import("@anthropic-ai/sdk");
    client = new AnthropicClient();
  }
  return client;
}

export async function parseIntent(prompt: string): Promise<Intent> {
  const response = await (await getClient()).messages.create({
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
  if (Array.isArray(raw.exclude_vibe_tags) && raw.exclude_vibe_tags.length > 0) intent.exclude_vibe_tags = raw.exclude_vibe_tags as VibeTag[];
  if (typeof raw.region === "string") intent.region = raw.region as Region;
  if (typeof raw.difficulty === "string") intent.difficulty = raw.difficulty as Difficulty;
  if (typeof raw.dogs_allowed === "boolean") intent.dogs_allowed = raw.dogs_allowed;
  if (typeof raw.time_budget_min === "number") intent.time_budget_min = raw.time_budget_min;
  if (raw.out_of_coverage === true) intent.out_of_coverage = true;
  return intent;
}
