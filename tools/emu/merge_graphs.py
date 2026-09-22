"""Merge several survey graphs of one sector into one: nodes by key, edges deduplicated."""
import json, sys
out = {'nodes': {}, 'edges': [], 'done': []}
seen = set()
for f in sys.argv[2:]:
    g = json.load(open(f))
    for k, n in g['nodes'].items():
        out['nodes'].setdefault(k, n)
    for e in g['edges']:
        sig = json.dumps(e, sort_keys=True)
        if sig in seen: continue
        seen.add(sig); out['edges'].append(e)
    out['done'] = sorted(set(out['done']) | set(g.get('done', [])))
json.dump(out, open(sys.argv[1], 'w'), indent=1)
print(sys.argv[1], len(out['nodes']), 'nodes', len(out['edges']), 'edges', sorted(set(n['room'] for n in out['nodes'].values())))
