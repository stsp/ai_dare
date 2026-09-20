import numpy as np, glob, sys
name=sys.argv[1]
def bits(d):
    scr=np.frombuffer(d[:6144],dtype=np.uint8); img=np.zeros((192,256),dtype=np.uint8)
    for y in range(192):
        row=(y&0xC0)|((y&7)<<3)|((y&0x38)>>3); img[y]=np.unpackbits(scr[row*32:row*32+32])
    return img
fs=sorted(glob.glob(f'{name}_[0-9][0-9][0-9].scr')); imgs=[bits(open(f,'rb').read()) for f in fs]
st=np.stack(imgs); bg=(st.mean(axis=0)>0.5)
# ai sprite bbox from frame 0 diff vs bg? use the union of diffs in a narrow band: find the bullet row = row with most diff frames
diffc=np.array([ (im!=bg)[:152].sum(axis=1) for im in imgs]).sum(axis=0)
row=int(np.argmax(diffc)); print('bullet row', row, 'frames', len(imgs))
# per-frame dash cells on the row
cells=[]
for im in imgs:
    d=(im[row]!=bg[row])&(im[row]==1); xs=np.nonzero(d)[0]
    cs=sorted(set((xs//8).tolist())); cells.append(cs)
print('first 30 frames cells:', cells[:30])
# bullets: a dash first appearing at muzzle cell; track head = the cell that is new this frame
muzzle=None
if cells[0]: muzzle=cells[0][0] if len(cells[0])==1 else None
print('muzzle cell guess', muzzle)
# estimate direction from later frames
allc=[c for cs in cells for c in cs]
print('cells seen min/max', min(allc), max(allc))
# head stop stats: for each frame, the max (or min) cell; count frames where it stays
dirn = 1 if (max(allc)-(muzzle or 0)) > ((muzzle or 0)-min(allc)) else -1
heads=[ (max(cs) if dirn>0 else min(cs)) if cs else None for cs in cells]
stops=[]
for t in range(1,len(heads)):
    if heads[t] is not None and heads[t]==heads[t-1] and len(cells[t])<len(cells[t-1]): stops.append((t,heads[t]))
stops=sorted(set(h for t,h in stops))
from collections import Counter
cnt=Counter()
prev=None
for t in range(1,len(heads)):
    if heads[t] is not None and heads[t]==heads[t-1] and len(cells[t])<len(cells[t-1]) and (prev is None or t-prev>2): cnt[heads[t]]+=1; prev=t
print('direction', dirn, 'head stop cells (cell: count):', sorted(cnt.items()))
print('ranges in cells from muzzle:', sorted(((c-(muzzle or 0))*dirn, n) for c,n in cnt.items()))
