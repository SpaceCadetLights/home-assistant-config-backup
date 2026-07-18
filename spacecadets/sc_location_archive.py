#!/usr/bin/env python3
"""Space Cadets long-term GPS archive.

Appends phone location pings to daily JSON files under:
  /config/www/spacecadets/location-history/<slug>/<YYYY-MM-DD>.json

Also maintains index.json listing which days have points.
Designed to keep years of location history independent of recorder purge/DB size.
"""
from __future__ import annotations

import json
import os
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(os.environ.get("SC_LOCATION_ROOT", "/config/www/spacecadets/location-history"))

# Map device_tracker entity_id → archive slug
ENTITY_SLUGS = {
    "device_tracker.isaacs_iphone": "isaac",
    "device_tracker.isaacs_iphone_14": "isaac",
    "device_tracker.jareds_iphone": "jared",
}


def slug_for(entity_id: str) -> str | None:
    if entity_id in ENTITY_SLUGS:
        return ENTITY_SLUGS[entity_id]
    # fallback: last part of entity id
    if entity_id.startswith("device_tracker."):
        name = entity_id.split(".", 1)[1]
        if "iphone" in name or "phone" in name or "pixel" in name or "android" in name:
            return name.replace("_", "-")
    return None


def day_key_from_ts(ts_ms: int) -> str:
    # Local US/Eastern-ish via HA host localtime
    return datetime.fromtimestamp(ts_ms / 1000.0).strftime("%Y-%m-%d")


def load_day(path: Path) -> list:
    if not path.exists():
        return []
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
        return data if isinstance(data, list) else []
    except Exception:
        return []


def save_day(path: Path, points: list) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(".tmp")
    tmp.write_text(json.dumps(points, separators=(",", ":")), encoding="utf-8")
    tmp.replace(path)


def update_index(slug: str, day: str, count: int) -> None:
    index_path = ROOT / "index.json"
    ROOT.mkdir(parents=True, exist_ok=True)
    try:
        index = json.loads(index_path.read_text(encoding="utf-8")) if index_path.exists() else {}
    except Exception:
        index = {}
    entry = index.get(slug) or {"days": {}, "updated": None}
    days = entry.get("days") or {}
    if count <= 0:
        days.pop(day, None)
    else:
        days[day] = count
    entry["days"] = days
    entry["updated"] = datetime.now(timezone.utc).isoformat()
    # compact list for UI
    entry["day_list"] = sorted(days.keys(), reverse=True)
    index[slug] = entry
    tmp = index_path.with_suffix(".tmp")
    tmp.write_text(json.dumps(index, indent=2), encoding="utf-8")
    tmp.replace(index_path)


def append_point(entity_id: str, lat: float, lon: float, ts_ms: int | None = None, accuracy: float | None = None) -> int:
    slug = slug_for(entity_id)
    if not slug:
        return 0
    if ts_ms is None:
        ts_ms = int(time.time() * 1000)
    day = day_key_from_ts(ts_ms)
    path = ROOT / slug / f"{day}.json"
    points = load_day(path)

    # Dedupe: skip if nearly same as last point within 20m / 2 min
    if points:
        prev = points[-1]
        plat, plon, pts = prev[0], prev[1], prev[2]
        if abs(plat - lat) < 0.00015 and abs(plon - lon) < 0.00015 and abs(pts - ts_ms) < 120_000:
            points[-1] = [round(lat, 6), round(lon, 6), ts_ms] + ([accuracy] if accuracy is not None else [])
            save_day(path, points)
            update_index(slug, day, len(points))
            return len(points)

    row = [round(lat, 6), round(lon, 6), int(ts_ms)]
    if accuracy is not None and str(accuracy) not in ("", "None", "unknown"):
        try:
            row.append(round(float(accuracy), 1))
        except Exception:
            pass
    points.append(row)
    save_day(path, points)
    update_index(slug, day, len(points))
    return len(points)


def merge_points(slug: str, day: str, new_points: list) -> int:
    path = ROOT / slug / f"{day}.json"
    existing = load_day(path)
    by_ts = {}
    for p in existing + new_points:
        if not p or len(p) < 3:
            continue
        by_ts[int(p[2])] = p
    merged = [by_ts[k] for k in sorted(by_ts.keys())]
    save_day(path, merged)
    update_index(slug, day, len(merged))
    return len(merged)


def main(argv: list[str]) -> int:
    if len(argv) < 2:
        print("usage: sc_location_archive.py append <entity_id> <lat> <lon> [ts_ms] [accuracy]", file=sys.stderr)
        return 2
    cmd = argv[1]
    if cmd == "append":
        entity_id = argv[2]
        lat = float(argv[3])
        lon = float(argv[4])
        ts_ms = int(float(argv[5])) if len(argv) > 5 and argv[5] not in ("", "None") else None
        accuracy = float(argv[6]) if len(argv) > 6 and argv[6] not in ("", "None", "unknown") else None
        n = append_point(entity_id, lat, lon, ts_ms, accuracy)
        print(f"ok {slug_for(entity_id)} points={n}")
        return 0
    print(f"unknown command {cmd}", file=sys.stderr)
    return 2


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
