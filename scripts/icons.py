#!/usr/bin/env python3
"""Génère les icônes de Stratbook depuis assets-src/icone-source.png (dessin noir sur fond blanc).

Le dessin devient blanc sur un carré sombre (#0F1720, fond de l'application) : lisible dans un onglet
clair comme sombre. Les zones blanches du dessin (yeux, bouche, éclat) laissent voir le fond.

Usage : pip install pillow, puis python3 scripts/icons.py
"""
from pathlib import Path

from PIL import Image, ImageDraw, ImageOps

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / 'assets-src' / 'icone-source.png'
OUT = ROOT / 'public' / 'icons'
BG = (15, 23, 32, 255)  # #0F1720
FG = (232, 238, 244, 255)  # #E8EEF4, texte de l'application
BIG = 1024  # dessin en grand, puis réduit (bords nets aux petites tailles)

# Masque du dessin : noir = opaque, blanc = transparent, recadré au plus près.
gray = Image.open(SRC).convert('L')
mask = ImageOps.invert(gray)
mask = mask.crop(mask.getbbox())


def icon(size, *, padding, radius):
    """Carré de `size` px : fond sombre (coins arrondis si radius > 0), dessin centré avec une marge."""
    canvas = Image.new('RGBA', (BIG, BIG), (0, 0, 0, 0))
    shape = Image.new('L', (BIG, BIG), 0)
    ImageDraw.Draw(shape).rounded_rectangle((0, 0, BIG - 1, BIG - 1), radius=int(radius * BIG), fill=255)
    canvas.paste(Image.new('RGBA', (BIG, BIG), BG), (0, 0), shape)
    box = int(BIG * (1 - 2 * padding))
    m = mask.copy()
    m.thumbnail((box, box), Image.LANCZOS)
    fg = Image.new('RGBA', m.size, FG)
    canvas.paste(fg, ((BIG - m.width) // 2, (BIG - m.height) // 2), m)
    return canvas.resize((size, size), Image.LANCZOS)


OUT.mkdir(parents=True, exist_ok=True)
icon(32, padding=0.05, radius=0.2).save(OUT / 'favicon-32.png')
icon(192, padding=0.12, radius=0.22).save(OUT / 'icon-192.png')
icon(512, padding=0.12, radius=0.22).save(OUT / 'icon-512.png')
# iPhone arrondit lui-même les coins : carré plein.
icon(180, padding=0.12, radius=0).save(OUT / 'apple-touch-icon.png')
# Android « maskable » : fond plein, dessin dans la zone sûre (cercle de 80 %).
icon(512, padding=0.2, radius=0).save(OUT / 'maskable-512.png')
print('icônes générées dans', OUT)
