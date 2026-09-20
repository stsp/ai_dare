#!/usr/bin/env python3
"""Write the corrections in tools/level_fixes.json into js/level.js.

The level is built from the surveys by build_level.py, which needs the map
image; where the build disagrees with the original's own floor probe, the
correction is kept here and applied to the generated file. Idempotent.

    python3 tools/apply_level_fixes.py [--level js/level.js]
"""
import argparse, json


def same(a, b):
    return all(a.get(k) == b.get(k) for k in ("y", "x0", "x1"))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--level", default="js/level.js")
    ap.add_argument("--fixes", default="tools/level_fixes.json")
    args = ap.parse_args()

    src = open(args.level).read()
    head, body = src[:src.index("=") + 1], src[src.index("=") + 1:].rstrip().rstrip(";")
    level = json.loads(body)
    fixes = json.load(open(args.fixes))["rooms"]
    for key, fix in fixes.items():
        room = level["rooms"][key]
        plats = room["platforms"]
        for d in fix.get("drop", []):
            plats = [p for p in plats if not same(p, d)]
        for r in fix.get("replace", []):
            plats = [dict(p, **{k: r["to"][k] for k in ("y", "x0", "x1")}) if same(p, r["from"]) else p for p in plats]
        for a in fix.get("add", []):
            if not any(same(p, a) for p in plats):
                plats.append(dict(a))
        room["platforms"] = sorted(plats, key=lambda p: (p["y"], p["x0"]))
        if "holes" in fix:
            room["holes"] = fix["holes"]
        print(f"room {key}: {fix['why']}")
    open(args.level, "w").write(head + json.dumps(level, separators=(",", ":")) + ";\n")


if __name__ == "__main__":
    main()
