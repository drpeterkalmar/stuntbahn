#!/usr/bin/env python3
"""Hilfe für tests/node/test_qr.mjs: QR-Matrix (JSON {n, m}) als PNG mit Ruhezone, 8 px je Modul."""
import json, sys
from PIL import Image
d = json.load(open(sys.argv[1]))
n, m, s, z = d['n'], d['m'], 8, 4
img = Image.new('L', ((n + 2 * z) * s,) * 2, 255)
px = img.load()
for r in range(n):
    for c in range(n):
        if m[r * n + c]:
            for y in range(s):
                for x in range(s):
                    px[(c + z) * s + x, (r + z) * s + y] = 0
img.save(sys.argv[2])
