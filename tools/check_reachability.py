#!/usr/bin/env python3
"""Check the level is playable: walk the connection graph from the start room.

Connections come from level.json's `links`, where each entry is
[roomA, roomB, kind] and kind is one of:

    side    a doorway through the wall between two rooms
    shaft   a grav-lift running across the boundary
    drop    a hole in a floor - one way, you cannot climb back up

Reports what is reachable, and separately what is reachable using only the
connections read from the map, so the amount of level design carried by the
generated links is visible rather than hidden.

Usage: python3 tools/check_reachability.py [level.json] [--start 0,3]
"""
import argparse
import json
from collections import deque


def walk(links, start, limit=None):
    """Reachable rooms from `start`. `limit` caps how many links may be used."""
    graph = {}
    for i, (a, b, kind) in enumerate(links):
        if limit is not None and i >= limit:
            break
        graph.setdefault(a, set()).add(b)
        if kind != "drop":                 # a drop only goes downwards
            graph.setdefault(b, set()).add(a)
    seen, q = {start}, deque([start])
    while q:
        for nxt in graph.get(q.popleft(), ()):
            if nxt not in seen:
                seen.add(nxt)
                q.append(nxt)
    return seen


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("level", nargs="?", default="level.json")
    ap.add_argument("--start")
    args = ap.parse_args()

    lv = json.load(open(args.level))
    rooms, links = lv["rooms"], lv["links"]
    start = args.start or lv.get("start") or min(rooms)
    generated = lv.get("generatedLinks", 0)
    from_map = len(links) - generated

    kinds = {}
    for _, _, k in links:
        kinds[k] = kinds.get(k, 0) + 1
    print(f"{len(rooms)} rooms, {len(links)} connections "
          f"({from_map} read from the map, {generated} generated) {kinds}")

    all_seen = walk(links, start)
    map_only = walk(links[:from_map], start)
    print(f"reachable from {start}: {len(all_seen)}/{len(rooms)} "
          f"({100 * len(all_seen) // len(rooms)}%)")
    print(f"  using only connections read from the map: {len(map_only)}/{len(rooms)} "
          f"({100 * len(map_only) // len(rooms)}%)")

    missing = sorted(set(rooms) - all_seen)
    if missing:
        print("unreachable:", " ".join(missing[:20]), "..." if len(missing) > 20 else "")
    return 0 if not missing else 1


if __name__ == "__main__":
    raise SystemExit(main())
