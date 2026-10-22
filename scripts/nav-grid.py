#!/usr/bin/env python3
"""Génère la grille de navigation d'une carte à partir de la transparence de son image.

Les zones jouables de l'image sont opaques, le reste est transparent. Une case de la grille
est praticable si la majorité de ses pixels est opaque. La grille sert au calcul automatique
des trajets entre deux positions (src/map/nav.js).

Usage (une fois par carte, ou quand l'image change) :
  pip install pillow
  python3 scripts/nav-grid.py public/maps/dust2.webp src/map/dust2-nav.js
"""
import base64
import sys

from PIL import Image

CELL = 5  # px de l'image par case : 1000 x 1000 donne une grille de 200 x 200

src, out = sys.argv[1], sys.argv[2]
alpha = Image.open(src).convert('RGBA').getchannel('A')
w, h = alpha.size
cols, rows = w // CELL, h // CELL
px = alpha.load()

bits = bytearray((cols * rows + 7) // 8)
for r in range(rows):
    for c in range(cols):
        opaque = sum(
            1
            for y in range(r * CELL, (r + 1) * CELL)
            for x in range(c * CELL, (c + 1) * CELL)
            if px[x, y] > 128
        )
        if opaque * 2 > CELL * CELL:
            i = r * cols + c
            bits[i >> 3] |= 1 << (i & 7)

data = base64.b64encode(bytes(bits)).decode()
with open(out, 'w', encoding='utf-8') as f:
    f.write('// Fichier généré par scripts/nav-grid.py à partir de la transparence de l\'image. Ne pas modifier à la main.\n')
    f.write(f'// Grille {cols} x {rows}, une case = {CELL} px de l\'image, 1 bit par case (1 = praticable).\n')
    f.write(f'export const NAV = {{ cell: {CELL}, cols: {cols}, rows: {rows}, bits: \'{data}\' }};\n')
print('ok', out, cols, rows, len(data), 'caractères')
