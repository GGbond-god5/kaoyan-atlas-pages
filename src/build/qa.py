# -*- coding: utf-8 -*-
"""Quality gate for the generated atlas: links, outline, pages, raw TeX."""
import glob
import json
import os
from pathlib import Path

import pymupdf

ROOT = Path(__file__).resolve().parents[2]
pages = json.loads((ROOT / "src/build/pages.json").read_text(encoding="utf-8"))
chapters = [json.loads(Path(f).read_text(encoding="utf-8"))
            for f in sorted(glob.glob(str(ROOT / "src/chapters/*/*.json")))]

problems = []
total_pages = 0
total_bytes = 0
for ch in chapters:
    cid = ch["id"]
    pdf = ROOT / "pdf" / f"{cid}.pdf"
    if not pdf.exists():
        problems.append(f"{cid}: missing pdf")
        continue
    doc = pymupdf.open(pdf)
    total_pages += doc.page_count
    total_bytes += os.path.getsize(pdf)
    meta = pages.get(cid, {})
    for i, page in enumerate(doc):
        text = page.get_text()
        links = [l for l in page.get_links() if l.get("file") == "../index.html"]
        if len(links) != 1:
            problems.append(f"{cid} p{i+1}: back links={len(links)}")
        if "\\\\(" in text or "\\\\[" in text:
            problems.append(f"{cid} p{i+1}: raw tex")
    if "真题标注" not in doc[0].get_text():
        problems.append(f"{cid}: disclaimer missing")
    for i, kp in enumerate(ch.get("kps", []), 1):
        kid = kp.get("id") or f"kp-{i:02d}"
        if not meta.get("kps", {}).get(kid):
            problems.append(f"{cid}: no page for {kid}")
    for i, tp in enumerate(ch.get("topics", []), 1):
        tid = tp.get("id") or f"topic-{i:02d}"
        if not meta.get("topics", {}).get(tid):
            problems.append(f"{cid}: no page for {tid}")
    if len(doc.get_toc()) < len(ch.get("kps", [])) + 1:
        problems.append(f"{cid}: thin outline ({len(doc.get_toc())})")
    doc.close()

print(f"chapters={len(chapters)} pdfs={len(glob.glob(str(ROOT / 'pdf/*.pdf')))} "
      f"pages={total_pages} size={total_bytes/1e6:.1f}MB")
print(f"problems={len(problems)}")
for p in problems[:20]:
    print("  ", p)
