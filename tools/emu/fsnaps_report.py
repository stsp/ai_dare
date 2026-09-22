"""Convert every Fuse snapshot of the walkthrough, list room/x/y in order, and dump each room's screen."""
import sys, os, glob, json
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from z80tojson import convert
d = sys.argv[1]
rows = []
for f in sorted(glob.glob(d + '/s*.z80')):
    try:
        snap, room, x, y, scr = convert(f)
    except Exception as e:
        print('bad', f, e); continue
    j = f[:-4] + '.json'
    if not os.path.exists(j): json.dump(snap, open(j, 'w'))
    rows.append((os.path.basename(f)[1:5], room, x, y))
    scrf = f"{d}/room_{room}.scr"
    if not os.path.exists(scrf) and 30 <= y <= 130: open(scrf, 'wb').write(scr)
segs = []
for t, room, x, y in rows:
    if segs and segs[-1]['room'] == room: segs[-1]['t1'] = t; segs[-1]['pts'].append((x, y))
    else: segs.append({'room': room, 't0': t, 't1': t, 'pts': [(x, y)]})
for s in segs:
    print(f"{s['t0']}-{s['t1']} room {s['room']:3d} " + ' '.join(f"{x},{y}" for x, y in s['pts']))
json.dump(segs, open(d + '/segments.json', 'w'))
