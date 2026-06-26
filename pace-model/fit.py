#!/usr/bin/env python3
"""Fit a pace-on-grade curve from Strava streams.

Reads every JSON file under pace-model/streams/ (one per activity, written by
fetch_streams.ts), computes per-sample (grade, pace) pairs, bins by grade, and
writes pace-model/leela.json with the median pace multiplier per bin.

Pure stdlib so it runs anywhere with Python 3.8+.

Usage:
    python3 pace-model/fit.py
    python3 pace-model/fit.py --bin-size 2   # 2% grade bins instead of 1%
"""
from __future__ import annotations

import argparse
import json
import statistics
from datetime import datetime, timezone
from pathlib import Path

HERE = Path(__file__).parent
STREAMS_DIR = HERE / "streams"
OUTPUT = HERE / "leela.json"

# Per-sample sanity bounds. Reject samples outside these ranges as GPS noise
# or non-running segments (stoplights, photo breaks).
MIN_PACE_MIN_PER_KM = 3.0   # 3:00/km is world-class 1500m pace; below that = GPS jitter
MAX_PACE_MIN_PER_KM = 20.0  # 20:00/km = slow walking; above that = stopped/waiting
MIN_DT_S = 1                # need at least 1s between samples
MIN_DX_M = 2                # need at least 2m of movement
MIN_GRADE_PCT = -40         # steeper than this and you're probably falling
MAX_GRADE_PCT = 40
BASELINE_GRADE_BAND = (-2, 2)   # bins used to compute baseline (flat-ground) pace
MIN_SAMPLES_PER_BIN = 30        # bins below this get smoothed from neighbors


def load_streams() -> list[dict]:
    files = sorted(STREAMS_DIR.glob("*.json"))
    out: list[dict] = []
    for f in files:
        try:
            out.append(json.loads(f.read_text()))
        except json.JSONDecodeError:
            print(f"  skip {f.name}: invalid JSON")
    return out


def per_sample_pairs(stream: dict) -> list[tuple[float, float]]:
    """Return (grade_pct, pace_min_per_km) pairs from one activity's streams."""
    t = stream.get("time", {}).get("data") or []
    d = stream.get("distance", {}).get("data") or []
    a = stream.get("altitude", {}).get("data") or []
    if not (len(t) == len(d) == len(a)) or len(t) < 2:
        return []

    pairs: list[tuple[float, float]] = []
    for i in range(1, len(t)):
        dt = t[i] - t[i - 1]
        dx = d[i] - d[i - 1]
        da = a[i] - a[i - 1]
        if dt < MIN_DT_S or dx < MIN_DX_M:
            continue
        pace_min_per_km = (dt / dx) * 1000.0 / 60.0
        if pace_min_per_km < MIN_PACE_MIN_PER_KM or pace_min_per_km > MAX_PACE_MIN_PER_KM:
            continue
        grade_pct = (da / dx) * 100.0
        if grade_pct < MIN_GRADE_PCT or grade_pct > MAX_GRADE_PCT:
            continue
        pairs.append((grade_pct, pace_min_per_km))
    return pairs


def bin_index(grade_pct: float, bin_size: int) -> int:
    """Center the bin on integer multiples of bin_size."""
    return round(grade_pct / bin_size) * bin_size


def fit(pairs: list[tuple[float, float]], bin_size: int) -> dict:
    """Group by grade bin, compute median pace per bin, return the curve."""
    by_bin: dict[int, list[float]] = {}
    for g, p in pairs:
        by_bin.setdefault(bin_index(g, bin_size), []).append(p)

    # Baseline pace: median across the flat band.
    flat = [p for g, p in pairs if BASELINE_GRADE_BAND[0] <= g <= BASELINE_GRADE_BAND[1]]
    if len(flat) < 100:
        raise SystemExit(
            f"Only {len(flat)} flat-ground samples in [{BASELINE_GRADE_BAND[0]},{BASELINE_GRADE_BAND[1]}]%; "
            "need a lot more before the curve is trustworthy. Pull more activities and rerun."
        )
    baseline = statistics.median(flat)

    # Build the curve as multiplier vs grade. Bins below the sample threshold
    # get linearly interpolated from their neighbors after the first pass.
    bins = sorted(by_bin.keys())
    raw = {b: statistics.median(by_bin[b]) for b in bins}
    counts = {b: len(by_bin[b]) for b in bins}

    # Forward-fill weak bins with the nearest well-sampled neighbor.
    well = sorted(b for b, n in counts.items() if n >= MIN_SAMPLES_PER_BIN)
    if not well:
        raise SystemExit(
            f"No bins with >={MIN_SAMPLES_PER_BIN} samples. Pull more activities and rerun."
        )

    smoothed: dict[int, float] = {}
    for b in bins:
        if counts[b] >= MIN_SAMPLES_PER_BIN:
            smoothed[b] = raw[b]
            continue
        # Linearly interpolate between the nearest well-sampled bins on each side.
        left = max((x for x in well if x <= b), default=None)
        right = min((x for x in well if x >= b), default=None)
        if left is not None and right is not None and left != right:
            t = (b - left) / (right - left)
            smoothed[b] = raw[left] * (1 - t) + raw[right] * t
        elif left is not None:
            smoothed[b] = raw[left]
        else:
            smoothed[b] = raw[right]  # type: ignore[index]

    curve = {str(b): round(smoothed[b] / baseline, 4) for b in bins}
    return {
        "fitted_at": datetime.now(timezone.utc).strftime("%Y-%m-%d"),
        "fitted_for": "leela",
        "n_activities": None,  # filled in by caller
        "n_samples_total": len(pairs),
        "baseline_pace_min_per_km": round(baseline, 3),
        "bin_size_pct": bin_size,
        "grade_curve": curve,
        "samples_per_bin": {str(b): counts.get(b, 0) for b in bins},
        "interpolation": "linear",
    }


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--bin-size", type=int, default=1, help="Grade bin width in percent (default 1).")
    args = ap.parse_args()

    streams = load_streams()
    if not streams:
        raise SystemExit(
            f"No streams in {STREAMS_DIR}. Run `npm run fetch-streams` first."
        )
    print(f"Loaded {len(streams)} activities.")

    pairs: list[tuple[float, float]] = []
    for s in streams:
        pairs.extend(per_sample_pairs(s))
    print(f"After filtering: {len(pairs):,} valid (grade, pace) samples.")

    out = fit(pairs, bin_size=args.bin_size)
    out["n_activities"] = len(streams)

    OUTPUT.write_text(json.dumps(out, indent=2) + "\n")
    print(f"Wrote {OUTPUT}")
    print(f"  baseline pace: {out['baseline_pace_min_per_km']} min/km")
    print(f"  bins: {len(out['grade_curve'])}  (sample counts in samples_per_bin)")


if __name__ == "__main__":
    main()
