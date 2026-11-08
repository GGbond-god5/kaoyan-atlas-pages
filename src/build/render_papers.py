# -*- coding: utf-8 -*-
"""Render math real-exam pages to content/math-pages/<year>-lite-pN.png."""
from pathlib import Path
import fitz

ROOT = Path(__file__).resolve().parents[2]
DIR = ROOT / "bank/00.考研数学（一二三）09-25真题+解析+做题本/考研数学一历年真题做题本/考研数学一真题09-25"
OUT = ROOT / "content" / "math-pages"
OUT.mkdir(parents=True, exist_ok=True)

for year in range(2009, 2024):
    pdf = DIR / f"{year}考研数学一真题.pdf"
    if not pdf.exists():
        print("missing", year)
        continue
    d = fitz.open(pdf)
    for i, pg in enumerate(d, 1):
        pix = pg.get_pixmap(matrix=fitz.Matrix(2.2, 2.2), colorspace=fitz.csGRAY)
        dest = OUT / f"{year}-lite-p{i}.png"
        pix.save(dest)
        print(dest.name, pix.width, pix.height, dest.stat().st_size)
    d.close()
