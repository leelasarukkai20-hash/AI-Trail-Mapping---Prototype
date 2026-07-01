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
import { withDerivedDistance, type Intent } from "../src/lib/intent";
import { matchConfidence, type ScoredRoute } from "../src/lib/ranker";
import { listRoutes } from "../src/lib/routes";

// Every active route in a region, computed from the live library so the case
// stays correct as routes are added/promoted (used to simulate "everything in
// the region is closed").
function activeIdsInRegion(region: string): Set<string> {
  return new Set(
    listRoutes()
      .filter((r) => r.properties.status === "active" && r.properties.region === region)
      .map((r) => r.properties.id)
  );
}

export interface RankingCase {
  id: string;
  title: string;
  prompt: string; // the natural-language prompt this intent represents (for reference)
  intent: Intent;
  closedIds?: Set<string>; // optional: simulate these route ids being closed
  assert: (ranked: ScoredRoute[], intent: Intent) => { pass: boolean; detail: string };
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
    title: "status filter -> only active routes are recommended",
    prompt: "Recommend me a great run",
    intent: {},
    assert: (r) => {
      if (!r.length) return { pass: false, detail: "no active routes (have any been promoted from draft?)" };
      const status = props(r[0]).status;
      return { pass: status === "active", detail: `top status=${status}` };
    },
  },
  {
    id: "RK-09",
    title: "no-match -> top pick reads as low confidence",
    prompt: "A flat 50-mile paved loop with no hills",
    intent: { distance_km: 80, max_gain_m: 0, surface_preference: "road" },
    assert: (r, intent) => {
      if (!r.length) return { pass: false, detail: "no routes returned" };
      const conf = matchConfidence(r[0].score, intent);
      return { pass: conf === "low",
        detail: `confidence=${conf} (closest=${props(r[0]).id}, score=${r[0].score.toFixed(2)})` };
    },
  },
  {
    id: "RK-10",
    title: "closure safety -> a closed route is never recommended",
    prompt: "I want waterfalls and redwoods",
    intent: { vibe_tags: ["waterfall", "redwoods"] },
    closedIds: new Set(["alpine-lake-loop"]),
    assert: (r) => {
      const present = ids(r).includes("alpine-lake-loop");
      return { pass: r.length > 0 && !present,
        detail: `alpine-lake-loop present=${present}; top=${r.length ? props(r[0]).id : "(none)"}` };
    },
  },
  {
    id: "RK-11",
    title: "negation -> top pick avoids the excluded tag",
    prompt: "Ocean-view run, but nothing too exposed",
    intent: { vibe_tags: ["ocean-views"], exclude_vibe_tags: ["exposed"] },
    assert: (r) => {
      if (!r.length) return { pass: false, detail: "no routes returned" };
      const hasExposed = props(r[0]).vibe_tags.includes("exposed");
      return { pass: !hasExposed, detail: `top=${props(r[0]).id} exposed=${hasExposed}` };
    },
  },
  {
    id: "RK-12",
    title: "confidence -> a real match reads as good",
    prompt: "Easy, flat run",
    intent: { difficulty: "easy", max_gain_m: 250 },
    assert: (r, intent) => {
      if (!r.length) return { pass: false, detail: "no routes returned" };
      const conf = matchConfidence(r[0].score, intent);
      return { pass: conf === "good", detail: `confidence=${conf} (top=${props(r[0]).id}, score=${r[0].score.toFixed(2)})` };
    },
  },
  {
    id: "RK-13",
    title: "surface preference -> singletrack request ranks a high-trail route first",
    prompt: "Mostly singletrack please",
    intent: { surface_preference: "trail" },
    assert: (r) => {
      if (!r.length) return { pass: false, detail: "no routes returned" };
      const pct = props(r[0]).surface.trail_pct;
      return { pass: pct >= 80, detail: `top=${props(r[0]).id} trail_pct=${pct}` };
    },
  },
  {
    id: "RK-14",
    title: "vert request -> min_gain produces a high-gain top pick",
    prompt: "Just give me vert",
    intent: { min_gain_m: 900 },
    assert: (r) => {
      if (!r.length) return { pass: false, detail: "no routes returned" };
      const gain = props(r[0]).gain_m;
      return { pass: gain >= 900, detail: `top=${props(r[0]).id} gain=${gain} m` };
    },
  },
  {
    id: "RK-15",
    title: "difficulty -> easy request never tops out at hard/very-hard",
    prompt: "Something easy",
    intent: { difficulty: "easy" },
    assert: (r) => {
      if (!r.length) return { pass: false, detail: "no routes returned" };
      const d = props(r[0]).difficulty;
      const ok = d === "easy" || d === "moderate"; // within one rank of the ask
      return { pass: ok, detail: `top=${props(r[0]).id} difficulty=${d}` };
    },
  },
  {
    id: "RK-16",
    title: "closures can empty a region -> ranker returns nothing (API shows top:null)",
    prompt: "Anything around Stinson",
    intent: { region: "Stinson Beach" },
    closedIds: activeIdsInRegion("Stinson Beach"),
    assert: (r) => {
      return { pass: r.length === 0,
        detail: `returned=${r.length} (expected 0 with all Stinson Beach routes closed)` };
    },
  },
  {
    id: "RK-17",
    title: "vague prompt -> no constraints reads as low confidence (arbitrary pick)",
    prompt: "Recommend me a great run",
    intent: {},
    assert: (r, intent) => {
      if (!r.length) return { pass: false, detail: "no routes returned" };
      const conf = matchConfidence(r[0].score, intent);
      return { pass: conf === "low", detail: `confidence=${conf} (top=${props(r[0]).id})` };
    },
  },
  {
    id: "RK-18",
    title: "filter-only prompt -> region/dogs hard filter still reads as good",
    prompt: "Anything around Stinson",
    intent: { region: "Stinson Beach" },
    assert: (r, intent) => {
      if (!r.length) return { pass: false, detail: "no routes returned" };
      const conf = matchConfidence(r[0].score, intent);
      return { pass: conf === "good", detail: `confidence=${conf} (${r.length} in-region routes)` };
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
      const ex = i.exclude_vibe_tags ?? [];
      const ok = i.distance_km != null && i.distance_km >= 8 && i.distance_km <= 12 && (i.vibe_tags ?? []).includes("ocean-views") && ex.includes("technical");
      return { pass: ok, detail: `dist=${i.distance_km} vibes=[${(i.vibe_tags ?? []).join(",")}] exclude=[${ex.join(",")}]` };
    },
  },
  {
    id: "IP-03",
    prompt: "I've got about 90 minutes and want a shaded run in the redwoods",
    check: (i) => {
      const v = i.vibe_tags ?? [];
      const resolved = withDerivedDistance(i, null);
      const ok = (i.time_budget_min ?? 0) >= 60 && resolved.distance_km != null && resolved.distance_km > 0 && v.includes("shaded") && v.includes("redwoods");
      return { pass: ok, detail: `time=${i.time_budget_min} -> ${resolved.distance_km} km; vibes=[${v.join(",")}]` };
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
      const ex = i.exclude_vibe_tags ?? [];
      return { pass: i.max_gain_m != null && ex.includes("exposed"),
        detail: `maxGain=${i.max_gain_m} exclude=[${ex.join(",")}]` };
    },
  },
  {
    id: "IP-06",
    prompt: "Any good trail runs near Lake Tahoe?",
    check: (i) => {
      return { pass: i.out_of_coverage === true, detail: `out_of_coverage=${i.out_of_coverage} region=${i.region}` };
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

  // IP-09..IP-12: the four homepage sample chips (src/app/page.tsx
  // SAMPLE_PROMPTS) — the prompts users are most likely to actually send.
  {
    id: "IP-09",
    prompt: "Just give me vert",
    check: (i) => {
      // Pure climbing ask: min_gain must land, and no distance should be invented.
      const ok = i.min_gain_m != null && i.min_gain_m > 0 && i.distance_km == null;
      return { pass: ok, detail: `minGain=${i.min_gain_m} dist=${i.distance_km} diff=${i.difficulty}` };
    },
  },
  {
    id: "IP-10",
    prompt: "Easy hour with my dog",
    check: (i) => {
      const ok =
        i.dogs_allowed === true &&
        i.time_budget_min != null && i.time_budget_min >= 45 && i.time_budget_min <= 75 &&
        i.distance_km == null &&
        (i.difficulty === "easy" || i.max_gain_m != null);
      return { pass: ok, detail: `dogs=${i.dogs_allowed} time=${i.time_budget_min} dist=${i.distance_km} diff=${i.difficulty}` };
    },
  },
  {
    id: "IP-11",
    prompt: "Long Sunday with ocean views",
    check: (i) => {
      // "Long" is qualitative: either left null (conservative) or resolved to a
      // genuinely long distance. Inventing a short distance is the failure mode.
      const distOk = i.distance_km == null || i.distance_km >= 15;
      const ok = (i.vibe_tags ?? []).includes("ocean-views") && distOk;
      return { pass: ok, detail: `vibes=[${(i.vibe_tags ?? []).join(",")}] dist=${i.distance_km}` };
    },
  },
  {
    id: "IP-12",
    prompt: "Shaded redwoods, no crowds",
    check: (i) => {
      const v = i.vibe_tags ?? [];
      const ex = i.exclude_vibe_tags ?? [];
      // "No crowds" must land somewhere: want 'quiet' or avoid 'popular'.
      const crowdsOk = v.includes("quiet") || ex.includes("popular");
      const ok = v.includes("shaded") && v.includes("redwoods") && crowdsOk;
      return { pass: ok, detail: `vibes=[${v.join(",")}] exclude=[${ex.join(",")}]` };
    },
  },

  {
    id: "IP-13",
    prompt: "10 miles of mostly singletrack in the Headlands",
    check: (i) => {
      const ok =
        i.surface_preference === "trail" &&
        i.region === "Headlands" &&
        i.distance_km != null && i.distance_km >= 14.5 && i.distance_km <= 17.5;
      return { pass: ok, detail: `surface=${i.surface_preference} region=${i.region} dist=${i.distance_km}` };
    },
  },
  {
    id: "IP-14",
    prompt: "Something with at least 3,000 feet of climbing",
    check: (i) => {
      // 3,000 ft = 914 m — checks the feet->meters conversion.
      const ok = i.min_gain_m != null && i.min_gain_m >= 800 && i.min_gain_m <= 1000;
      return { pass: ok, detail: `minGain=${i.min_gain_m} (expected ~914)` };
    },
  },
  {
    id: "IP-15",
    prompt: "Run up Mount Tam from Mill Valley",
    check: (i) => {
      // In-coverage guard: Marin landmarks must NOT trip out_of_coverage.
      const ok = i.out_of_coverage !== true;
      return { pass: ok, detail: `out_of_coverage=${i.out_of_coverage} region=${i.region}` };
    },
  },
  {
    id: "IP-16",
    prompt: "Surprise me with something nice",
    check: (i) => {
      // Conservative-parsing guard: a vague prompt must not hallucinate constraints.
      const ok =
        i.distance_km == null && i.min_gain_m == null && i.max_gain_m == null &&
        i.region == null && i.difficulty == null && i.dogs_allowed == null &&
        i.time_budget_min == null && i.out_of_coverage !== true &&
        (i.vibe_tags ?? []).length <= 1;
      return { pass: ok, detail: `dist=${i.distance_km} gain=${i.min_gain_m}/${i.max_gain_m} region=${i.region} diff=${i.difficulty} vibes=[${(i.vibe_tags ?? []).join(",")}]` };
    },
  },
  {
    id: "IP-17",
    prompt: "I've got 2 hours but want around 10 miles",
    check: (i) => {
      // Distance beats time when both are given — distance_km is what the
      // ranker consumes (withDerivedDistance only fills it when null).
      const ok = i.distance_km != null && i.distance_km >= 14.5 && i.distance_km <= 17.5;
      return { pass: ok, detail: `dist=${i.distance_km} time=${i.time_budget_min}` };
    },
  },
];
