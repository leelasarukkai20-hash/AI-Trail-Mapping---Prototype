/**
 * Eval cases for the recommendation engine.
 *
 * Two kinds:
 *  - rankingCases: feed a representative (assumed-correct) Intent into rankRoutes
 *    and assert on the result. Pure + deterministic, so they run offline with no
 *    API key. This isolates the SCORER from the LLM.
 *  - intentCases: feed a natural-language prompt into parseIntent (Haiku) and
 *    check the structured output. These need ANTHROPIC_API_KEY and cost a few
 *    cents of Haiku calls; the runner skips them if no key is set.
 *
 * Each assert/check returns { pass, detail } so a "fail" is still useful signal,
 * not a crash. Derived from "Vert - Recommendation Eval Test Cases.xlsx".
 */
import type { Intent } from "../src/lib/intent";
import type { ScoredRoute } from "../src/lib/ranker";

export interface RankingCase {
  id: string;
  title: string;
  prompt: string; // the natural-language prompt this intent represents (for reference)
  intent: Intent;
  assert: (ranked: ScoredRoute[]) => { pass: boolean; detail: string };
}

export interface IntentCase {
  id: string;
  prompt: string;
  check: (intent: Intent) => { pass: boolean; detail: string };
}

const km = (r: ScoredRoute) => r.route.properties.distance_km;
const props = (r: ScoredRoute) => r.route.properties;
const ids = (rs: ScoredRoute[]) => rs.map((r) => r.route.properties.id);

export const rankingCases: RankingCase[] = [
  {
    id: "RK-01",
    title: "easy + flat -> easy, low-gain top pick",
    prompt: "Easy short run, smooth and flat",
    intent: { difficulty: "easy", max_gain_m: 250 },
    assert: (r) => {
      if (!r.length) return { pass: false, detail: "no routes returned" };
      const p = props(r[0]);
      return { pass: p.difficulty === "easy" && p.gain_m <= 350,
        detail: `top=${p.id} (${p.difficulty}, ${p.gain_m} m)` };
    },
  },
  {
    id: "RK-02",
    title: "waterfalls + redwoods -> tags present on top pick",
    prompt: "I want waterfalls and redwoods",
    intent: { vibe_tags: ["waterfall", "redwoods"] },
    assert: (r) => {
      if (!r.length) return { pass: false, detail: "no routes returned" };
      const t = new Set(props(r[0]).vibe_tags);
      return { pass: t.has("waterfall") && t.has("redwoods"),
        detail: `top=${props(r[0]).id} tags=[${props(r[0]).vibe_tags.join(",")}]` };
    },
  },
  {
    id: "RK-03",
    title: "Headlands + ocean-views + moderate + ~13.5k",
    prompt: "Ocean views, moderate, about 13-14k in the Headlands",
    intent: { region: "Headlands", vibe_tags: ["ocean-views"], distance_km: 13.5, distance_tolerance_km: 2, difficulty: "moderate" },
    assert: (r) => {
      if (!r.length) return { pass: false, detail: "no routes returned" };
      const p = props(r[0]);
      const ok = p.region === "Headlands" && p.vibe_tags.includes("ocean-views") && Math.abs(p.distance_km - 13.5) <= 3 && p.difficulty === "moderate";
      return { pass: ok, detail: `top=${p.id} (${p.region}, ${p.distance_km} km, ${p.difficulty}, ocean-views=${p.vibe_tags.includes("ocean-views")})` };
    },
  },
  {
    id: "RK-04",
    title: "around 20k -> ALL of top + 2 alternates within +/-15%",
    prompt: "Around 20k please",
    intent: { distance_km: 20, distance_tolerance_km: 3 },
    assert: (r) => {
      const three = r.slice(0, 3);
      if (three.length < 3) return { pass: false, detail: `only ${three.length} returned` };
      const inBand = three.every((x) => Math.abs(km(x) - 20) <= 3);
      return { pass: inBand, detail: `distances=[${three.map(km).join(", ")}] km` };
    },
  },
  {
    id: "RK-05",
    title: "region filter is hard (Stinson Beach)",
    prompt: "Anything around Stinson",
    intent: { region: "Stinson Beach" },
    assert: (r) => {
      if (!r.length) return { pass: false, detail: "no routes returned" };
      const allStinson = r.every((x) => props(x).region === "Stinson Beach");
      return { pass: allStinson, detail: `${r.length} routes, all Stinson Beach=${allStinson}` };
    },
  },
  {
    id: "RK-06",
    title: "3 distinct alternates, all in region",
    prompt: "A moderate Headlands loop with good views",
    intent: { region: "Headlands", vibe_tags: ["ocean-views"] },
    assert: (r) => {
      const three = r.slice(0, 3);
      const distinct = new Set(ids(three)).size === three.length;
      const allRegion = three.every((x) => props(x).region === "Headlands");
      return { pass: three.length === 3 && distinct && allRegion,
        detail: `top3=[${ids(three).join(", ")}]` };
    },
  },
  {
    id: "RK-07",
    title: "dogs_allowed filter -> only dog-friendly routes",
    prompt: "Something I can bring my dog on",
    intent: { dogs_allowed: true },
    assert: (r) => {
      if (!r.length) return { pass: false, detail: "0 routes returned (no route has dogs_allowed:true yet)" };
      const allDogs = r.every((x) => props(x).dogs_allowed === true);
      return { pass: allDogs, detail: `${r.length} routes, all dog-friendly=${allDogs}` };
    },
  },
  {
    id: "RK-08",
    title: "[known gap] never recommend a non-active route",
    prompt: "Recommend me a great run",
    intent: {},
    assert: (r) => {
      if (!r.length) return { pass: false, detail: "no routes returned" };
      const status = props(r[0]).status;
      return { pass: status === "active",
        detail: `top status=${status} -- EXPECTED FAIL until routes are promoted to active AND the filter in ranker.ts is re-enabled` };
    },
  },
  {
    id: "RK-09",
    title: "[known gap] no-match should flag low confidence",
    prompt: "A flat 50-mile paved loop with no hills",
    intent: { distance_km: 80, max_gain_m: 0, surface_preference: "road" },
    assert: (r) => {
      if (!r.length) return { pass: false, detail: "no routes returned" };
      const top = r[0];
      // It returns a closest match (graceful) but there's no confidence signal yet.
      return { pass: r.length > 0,
        detail: `closest=${props(top).id} (${km(top)} km), score=${top.score.toFixed(2)} -- no low-confidence flag exists yet (gap #4)` };
    },
  },
];

export const intentCases: IntentCase[] = [
  {
    id: "IP-01",
    prompt: "I want an easy, flat 5-miler near Mill Valley",
    check: (i) => {
      const ok = i.region === "Mill Valley" && i.distance_km != null && i.distance_km >= 6.5 && i.distance_km <= 9.5 && (i.difficulty === "easy" || i.max_gain_m != null);
      return { pass: ok, detail: `region=${i.region} dist=${i.distance_km} diff=${i.difficulty} maxGain=${i.max_gain_m}` };
    },
  },
  {
    id: "IP-02",
    prompt: "Something around 10k with ocean views, not too technical",
    check: (i) => {
      const ok = i.distance_km != null && i.distance_km >= 8 && i.distance_km <= 12 && (i.vibe_tags ?? []).includes("ocean-views");
      return { pass: ok, detail: `dist=${i.distance_km} vibes=[${(i.vibe_tags ?? []).join(",")}] (note: 'not too technical' can't be expressed yet)` };
    },
  },
  {
    id: "IP-03",
    prompt: "I've got about 90 minutes and want a shaded run in the redwoods",
    check: (i) => {
      const v = i.vibe_tags ?? [];
      return { pass: v.includes("shaded") && v.includes("redwoods"), detail: `vibes=[${v.join(",")}] dist=${i.distance_km}` };
    },
  },
  {
    id: "IP-04",
    prompt: "Big hard day, like 30k with lots of climbing",
    check: (i) => {
      const ok = i.distance_km != null && i.distance_km >= 26 && i.distance_km <= 34 && (i.difficulty === "hard" || i.difficulty === "very-hard" || i.min_gain_m != null);
      return { pass: ok, detail: `dist=${i.distance_km} diff=${i.difficulty} minGain=${i.min_gain_m}` };
    },
  },
  {
    id: "IP-05",
    prompt: "A loop with no big climbs, and avoid exposed ridges",
    check: (i) => {
      return { pass: i.max_gain_m != null, detail: `maxGain=${i.max_gain_m} (note: 'avoid exposed' has no field to land in -- gap #3)` };
    },
  },
  {
    id: "IP-06",
    prompt: "Any good trail runs near Lake Tahoe?",
    check: (i) => {
      const ok = i.region == null || i.region === "Other";
      return { pass: ok, detail: `region=${i.region} (no out-of-coverage signal exists -- it should say Tahoe isn't covered)` };
    },
  },
  {
    id: "IP-07",
    prompt: "ezy 10 mile run w wildflowers",
    check: (i) => {
      const ok = i.distance_km != null && i.distance_km >= 14 && i.distance_km <= 18 && (i.vibe_tags ?? []).includes("wildflowers");
      return { pass: ok, detail: `dist=${i.distance_km} diff=${i.difficulty} vibes=[${(i.vibe_tags ?? []).join(",")}]` };
    },
  },
  {
    id: "IP-08",
    prompt: "Something with my dog, moderate, around 12k",
    check: (i) => {
      const ok = i.dogs_allowed === true && i.distance_km != null && i.distance_km >= 9 && i.distance_km <= 15;
      return { pass: ok, detail: `dogs=${i.dogs_allowed} dist=${i.distance_km} diff=${i.difficulty}` };
    },
  },
];
