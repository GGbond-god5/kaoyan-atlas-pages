# -*- coding: utf-8 -*-
"""Render one mock set into per-paper page images.

Usage: py -3 src/build/render_mock_set.py <set_index> <pages_per_paper>
"""
import json, sys
from pathlib import Path
import fitz

ROOT = Path(__file__).resolve().parents[2]
idx = int(sys.argv[1])
per = int(sys.argv[2])
skip = int(sys.argv[3]) if len(sys.argv) > 3 else 0
raw = (ROOT / "assets/papers.js").read_text(encoding="utf-8")
data = json.loads(raw.split("=", 1)[1].rstrip(";\n"))
entry = data["mock"][idx]
pdf = ROOT / entry["exam"]
slug = f"mock{idx}"
out = ROOT / "content" / "math-pages" / slug
out.mkdir(parents=True, exist_ok=True)

d = fitz.open(pdf)
total = len(d) - skip
n_papers = (total + per - 1) // per
manifest = []
for n in range(n_papers):
    start = skip + n * per
    end = min(start + per, len(d))
    images = []
    for p in range(start, end):
        pix = d[p].get_pixmap(matrix=fitz.Matrix(2.2, 2.2), colorspace=fitz.csGRAY)
        dest = out / f"p{p+1:02d}.png"
        pix.save(dest)
        images.append(str(dest.relative_to(ROOT)).replace("\\", "/"))
    manifest.append({"n": n + 1, "pdfStart": start + 1, "pdfEnd": end,
                     "title": f"{entry['title']}（第{n+1}套）",
                     "chapter": f"math-mock-{idx}-{n+1}",
                     "sourcePdf": entry["exam"], "images": images})
d.close()
(ROOT / "src" / "bank" / f"mock-manifest-{idx}.json").write_text(
    json.dumps({"set": entry["title"], "index": idx, "papers": manifest}, ensure_ascii=False, indent=1),
    encoding="utf-8")
print("papers", n_papers, "pages", total, "dir", out)
