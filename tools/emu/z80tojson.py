"""Convert a .z80 snapshot (v1/v2/v3, 48K) to the harness's JSON snapshot; print room and Ai's x/y."""
import sys, json, base64
def convert(path):
    z = open(path, 'rb').read()
    A, F = z[0], z[1]; BC = z[2] | z[3] << 8; HL = z[4] | z[5] << 8; PC = z[6] | z[7] << 8; SP = z[8] | z[9] << 8
    I, R, b12 = z[10], z[11], z[12]
    if b12 == 255: b12 = 1
    R = (R & 0x7f) | ((b12 & 1) << 7); border = (b12 >> 1) & 7
    DE = z[13] | z[14] << 8; BC_ = z[15] | z[16] << 8; DE_ = z[17] | z[18] << 8; HL_ = z[19] | z[20] << 8
    A_, F_ = z[21], z[22]; IY = z[23] | z[24] << 8; IX = z[25] | z[26] << 8
    iff1, iff2, im = z[27] != 0, z[28] != 0, z[29] & 3
    def decomp(b):
        out = bytearray(); i = 0
        while i < len(b):
            if b[i] == 0xED and i + 3 < len(b) and b[i + 1] == 0xED:
                out += bytes([b[i + 3]]) * b[i + 2]; i += 4
            else:
                out.append(b[i]); i += 1
        return bytes(out)
    pages = {}
    if PC == 0:
        hl = z[30] | z[31] << 8; PC = z[32] | z[33] << 8; p = 32 + hl
        while p + 3 <= len(z):
            L = z[p] | z[p + 1] << 8; pg = z[p + 2]; p += 3
            if L == 0xFFFF: data = z[p:p + 16384]; p += 16384
            else: data = decomp(z[p:p + L]); p += L
            pages[pg] = data
        mp = {8: '5', 4: '2', 5: '0'}
        mem = {mp[k]: v for k, v in pages.items() if k in mp}
    else:
        body = z[30:]
        if b12 & 0x20: body = decomp(body)
        mem = {'5': body[0:16384], '2': body[16384:32768], '0': body[32768:49152]}
    snap = {'model': 48, 'registers': {'AF': A << 8 | F, 'BC': BC, 'DE': DE, 'HL': HL, 'AF_': A_ << 8 | F_, 'BC_': BC_, 'DE_': DE_, 'HL_': HL_,
            'IX': IX, 'IY': IY, 'SP': SP, 'IR': I << 8 | R, 'PC': PC, 'iff1': iff1, 'iff2': iff2, 'im': im},
            'halted': False, 'tstates': 0, 'ulaState': {'borderColour': border},
            'pages': {k: base64.b64encode(v).decode() for k, v in mem.items()}}
    room = mem['5'][0x6297 - 0x4000]; y = mem['0'][0xC012 - 0xC000]; x = mem['0'][0xC013 - 0xC000]
    return snap, room, x, y, mem['5'][:6912]
if __name__ == '__main__':
    for path in sys.argv[1:]:
        snap, room, x, y, scr = convert(path)
        out = path[:-4] + '.json'; json.dump(snap, open(out, 'w'))
        print(f"{path}: room {room} x {x} y {y} -> {out}")
