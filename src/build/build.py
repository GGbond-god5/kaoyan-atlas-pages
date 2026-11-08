# -*- coding: utf-8 -*-
"""Build all chapter PDFs: JSON -> HTML -> Edge print -> PDF post-process."""
import json
import os
import re
import subprocess
import sys
from pathlib import Path

import pymupdf

ROOT = Path(__file__).resolve().parents[2]
EDGE = r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"
SUBJECT_ORDER = {"math": 0, "english": 1, "mechanics": 2, "politics": 3}
SUBJECT_CN = {"math": "数学一", "english": "英语一", "mechanics": "807 材料力学", "politics": "政治"}
SUBJECT_ACCENT = {
    "math": (0.12, 0.23, 0.37),
    "english": (0.36, 0.23, 0.42),
    "mechanics": (0.54, 0.29, 0.16),
    "politics": (0.63, 0.17, 0.17),
}


def load(path: Path):
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception as e:
        print(f"  ! skip {path.name}: {e}")
        return None


def chapter_files():
    out = []
    for sid in SUBJECT_ORDER:
        for p in sorted((ROOT / "src" / "chapters" / sid).glob("*.json")):
            out.append(p)
    return out


def render_html(ch: dict, dest: Path):
    sys.path.insert(0, str(ROOT / "src" / "build"))
    import render
    dest.write_text(render.build_chapter(ch), encoding="utf-8")


def print_pdf(html: Path, pdf: Path):
    url = "file:///" + html.as_posix().replace(" ", "%20")
    cmd = [
        EDGE, "--headless", "--disable-gpu", "--no-pdf-header-footer",
        "--virtual-time-budget=8000", f"--print-to-pdf={pdf}", url,
    ]
    subprocess.run(cmd, check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
                   timeout=180)


def text_width(text, size):
    w = 0.0
    for c in text:
        w += size * (1.0 if ord(c) > 0x2E80 else 0.52)
    return w


def postprocess(pdf: Path, ch: dict) -> dict:
    doc = pymupdf.open(pdf)
    n = doc.page_count
    h = doc[0].rect.height
    w = doc[0].rect.width
    accent = SUBJECT_ACCENT[ch["subject"]]
    font_path = r"C:\Windows\Fonts\SourceHanSansCN-Normal.ttf"
    brand = "2027 考研科目大观 · 华南理工 085500"
    margin = 45.0

    for i, page in enumerate(doc):
        page.insert_font(fontname="cjk", fontfile=font_path)
        # running header
        page.insert_text((margin, 33), SUBJECT_CN[ch["subject"]], fontname="cjk",
                         fontsize=6.8, color=accent)
        right = f"{ch['code']} · {ch['title']}"
        rw = text_width(right, 6.8)
        page.insert_text((w - margin - rw, 33), right, fontname="cjk",
                         fontsize=6.8, color=(0.55, 0.52, 0.47))
        page.draw_line((margin, 40), (w - margin, 40), color=(0.85, 0.82, 0.76), width=0.5)

        # footer
        page.draw_line((margin, h - 42), (w - margin, h - 42), color=(0.88, 0.85, 0.80), width=0.5)
        page.insert_text((margin, h - 28), brand, fontname="cjk", fontsize=6.2,
                         color=(0.62, 0.59, 0.54))
        if i > 0:
            label = f"{i + 1:02d} / {n:02d}"
            lw = text_width(label, 6.6)
            page.insert_text((w / 2 - lw / 2, h - 28), label, fontname="helv",
                             fontsize=6.6, color=(0.55, 0.52, 0.47))

        # back-to-index button, every page
        btn = pymupdf.Rect(w - margin - 64, h - 38, w - margin, h - 17)
        page.draw_rect(btn, radius=0.5, color=None, fill=(0.66, 0.20, 0.16))
        page.insert_textbox(pymupdf.Rect(btn.x0, btn.y0 + 3, btn.x1, btn.y1 + 3), "← 返回目录", fontname="cjk", fontsize=7,
                            color=(1, 1, 1), align=1)
        page.insert_link({"kind": pymupdf.LINK_GOTOR, "from": btn,
                          "file": "../index.html", "page": 0})

    # markers -> page map
    pages = {"kps": {}, "topics": {}, "summary": None}
    for i, page in enumerate(doc):
        text = page.get_text()
        for m in re.finditer(r"\[\[K-([A-Za-z0-9_-]+)\]\]", text):
            pages["kps"].setdefault(m.group(1), i + 1)
        for m in re.finditer(r"\[\[T-([A-Za-z0-9_-]+)\]\]", text):
            pages["topics"].setdefault(m.group(1), i + 1)
        if "[[S-summary]]" in text:
            pages["summary"] = i + 1

    # outline
    toc = [[1, f"{ch['code']} · {ch['title']}", 1]]
    for idx, kp in enumerate(ch.get("kps", []), 1):
        p = pages["kps"].get(kp.get("id") or f"kp-{idx:02d}")
        if p:
            toc.append([2, f"{idx:02d} {kp['name']}", p])
    for idx, tp in enumerate(ch.get("topics", []), 1):
        p = pages["topics"].get(tp.get("id") or f"topic-{idx:02d}")
        if p:
            toc.append([1, f"专题 {idx:02d} · {tp['name']}", p])
    if pages["summary"]:
        toc.append([1, "本章收口", pages["summary"]])
    doc.set_toc(toc)

    doc.set_metadata({
        "title": f"{SUBJECT_CN[ch['subject']]} · {ch['title']}",
        "author": "2027 考研科目大观 · 华南理工 085500",
        "subject": "考研复习讲义",
        "creator": "kaoyan-atlas",
    })
    try:
        doc.subset_fonts()
    except Exception:
        pass
    tmp = pdf.with_suffix(".tmp.pdf")
    doc.save(tmp, garbage=4, deflate=True)
    doc.close()
    os.replace(tmp, pdf)

    pages["file"] = pdf.name
    pages["title"] = ch["title"]
    pages["subject"] = ch["subject"]
    pages["number"] = ch.get("number") or ch["id"].split("-")[-1]
    pages["count"] = n
    return pages


def build_one(path: Path, pages_db: dict):
    ch = load(path)
    if ch is None:
        return
    cid = ch["id"]
    html = ROOT / "content" / f"{cid}.html"
    pdf = ROOT / "pdf" / f"{cid}.pdf"
    render_html(ch, html)
    if pdf.exists():
        pdf.unlink()
    print_pdf(html, pdf)
    pages_db[cid] = postprocess(pdf, ch)
    print(f"  ok {cid}: {pages_db[cid]['count']} pages, "
          f"{len(pages_db[cid]['kps'])} kps")


def main():
    only = sys.argv[1] if len(sys.argv) > 1 else None
    pages_db = {}
    db_path = ROOT / "src" / "build" / "pages.json"
    if db_path.exists():
        pages_db = json.loads(db_path.read_text(encoding="utf-8"))
    for path in chapter_files():
        if only:
            cid = json.loads(path.read_text(encoding="utf-8"))["id"]
            if cid != only:
                continue
        build_one(path, pages_db)
    db_path.write_text(json.dumps(pages_db, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"total {len(pages_db)} chapters")


if __name__ == "__main__":
    main()
