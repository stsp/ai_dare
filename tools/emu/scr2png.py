import sys
from PIL import Image
d=open(sys.argv[1],'rb').read()
P=[(0,0,0),(0,0,205),(205,0,0),(205,0,205),(0,205,0),(0,205,205),(205,205,0),(205,205,205)]
im=Image.new('RGB',(256,192))
px=im.load()
for y in range(192):
    row=(y&0xC0)|((y&7)<<3)|((y&0x38)>>3)
    for x in range(256):
        b=d[row*32+x//8]; bit=(b>>(7-x%8))&1
        a=d[6144+(y//8)*32+x//8]; ink=a&7; pap=(a>>3)&7; br=(a>>6)&1
        c=P[ink if bit else pap]; 
        if br: c=tuple(min(255,v+50) for v in c)
        px[x,y]=c
im=im.resize((512,384),Image.NEAREST); im.save(sys.argv[2])
