# -*- coding: utf-8 -*-
"""Build printable PDFs for the vocabulary module and politics timeline."""
import html
import json
import subprocess
from pathlib import Path

import pymupdf

ROOT = Path(__file__).resolve().parents[2]
EDGE = r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"
FONT = r"C:\Windows\Fonts\SourceHanSansCN-Normal.ttf"


def esc(t):
    return html.escape(str(t), quote=False)


def load_js(path, marker="="):
    s = Path(path).read_text(encoding="utf-8")
    s = s[s.index(marker) + 1:].strip().rstrip(";")
    return json.loads(s)


PRINT_CSS = """
@page{size:A4;margin:16mm 14mm 14mm}
*{box-sizing:border-box}
html{-webkit-print-color-adjust:exact;print-color-adjust:exact}
body{margin:0;font-family:"Noto Sans SC","Microsoft YaHei",sans-serif;font-size:9pt;line-height:1.65;color:#222}
h1{font-family:"Noto Serif SC","Source Han Serif SC",SimSun,serif;font-size:26pt;margin:0 0 4mm;line-height:1.25}
h2{font-family:"Noto Serif SC",serif;font-size:15pt;margin:6mm 0 2mm}
h3{font-family:"Noto Serif SC",serif;font-size:11pt;margin:3mm 0 1mm}
.kicker{font-size:7pt;letter-spacing:.24em;color:#8B8578;margin-bottom:2mm}
.lead{font-size:9.5pt;color:#4A453D;line-height:1.9;margin:0 0 5mm}
.cover{padding:24mm 0 8mm;border-bottom:1.2pt solid #17161A;margin-bottom:6mm}
.cover .meta{display:flex;gap:8mm;margin-top:5mm;font-size:8pt;color:#8B8578}
.cover .meta b{display:block;font-family:"Noto Serif SC",serif;font-size:16pt;color:#17161A}
.era{font-family:"Noto Serif SC",serif;font-size:14pt;color:#A8342A;margin:7mm 0 3mm;padding-bottom:1.5mm;border-bottom:.6pt solid #DAD2C3;break-after:avoid}
.ev{display:flex;gap:5mm;padding:2.4mm 0;border-bottom:.4pt solid #E7E0D3;break-inside:avoid}
.ev .date{width:20mm;flex:none;font-family:"Noto Serif SC",serif;font-size:9.5pt;color:#8A4B2A}
.ev h3{font-family:"Noto Serif SC",serif;font-size:10.5pt;margin:0 0 .8mm}
.ev p{font-size:8.2pt;color:#4A453D;margin:0 0 1mm;line-height:1.6}
.ev .tags{font-size:6.8pt;color:#8B8578;letter-spacing:.02em}
.topic{border-top:1pt solid #DAD2C3;padding-top:4mm;margin-top:5mm;break-inside:auto}
.topic .tintro{font-size:8.6pt;color:#4A453D;line-height:1.8;margin:0 0 4mm}
.group{break-inside:avoid;margin-bottom:4mm}
.group h3{font-size:10pt;margin:0 0 1mm}
.group .gnote{font-size:7.6pt;color:#8B8578;margin:0 0 2mm}
.words{columns:2;column-gap:7mm}
.w{break-inside:avoid;padding:1.2mm 0;border-bottom:.35pt dotted #E7E0D3;font-size:7.8pt;line-height:1.55}
.w b{font-family:"Noto Serif SC",serif;font-size:8.6pt;color:#17161A}
.w .m{color:#4A453D}
.w .n{display:block;color:#8B8578;font-size:7pt;margin-top:.3mm}
.letter{font-family:"Noto Serif SC",serif;font-size:13pt;color:#A8342A;margin:5mm 0 1.5mm;break-after:avoid}
.cols{columns:3;column-gap:6mm;column-rule:.3pt solid #E7E0D3}
.entry{break-inside:avoid;font-size:7.3pt;line-height:1.5;padding:.35mm 0}
.entry b{font-family:"Noto Serif SC",serif;font-size:7.8pt}
.entry .z{color:#A8342A;font-size:6.4pt;margin-left:1mm}
.entry .n{color:#8B8578;font-size:6.2pt;margin-left:1mm}
.note{font-size:7.6pt;color:#8B8578;line-height:1.7;margin-top:5mm}
"""


def print_pdf(html_path, pdf_path):
    url = "file:///" + html_path.as_posix().replace(" ", "%20")
    subprocess.run([
        EDGE, "--headless", "--disable-gpu", "--no-pdf-header-footer",
        "--virtual-time-budget=5000", f"--print-to-pdf={pdf_path}", url,
    ], check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=180)


def postprocess(pdf_path, back_href, title):
    doc = pymupdf.open(pdf_path)
    w, h = doc[0].rect.width, doc[0].rect.height
    for i, page in enumerate(doc):
        page.insert_font(fontname="cjk", fontfile=FONT)
        if i > 0:
            label = f"{i + 1:02d} / {doc.page_count:02d}"
            page.insert_text((w / 2 - 12, h - 8), label, fontname="helv", fontsize=6.4,
                             color=(0.55, 0.52, 0.47))
        btn = pymupdf.Rect(w - 52, h - 17, w - 14, h - 6)
        page.draw_rect(btn, radius=0.5, color=None, fill=(0.66, 0.20, 0.16))
        page.insert_textbox(pymupdf.Rect(btn.x0, btn.y0 + 1.8, btn.x1, btn.y1 + 1.8),
                            "返回网页版", fontname="cjk", fontsize=5.6, color=(1, 1, 1), align=1)
        page.insert_link({"kind": pymupdf.LINK_GOTOR, "from": btn, "file": back_href, "page": 0})
    doc.set_metadata({"title": title, "author": "2027 考研科目大观", "creator": "kaoyan-atlas"})
    try:
        doc.subset_fonts()
    except Exception:
        pass
    tmp = pdf_path.with_suffix(".tmp.pdf")
    doc.save(tmp, garbage=4, deflate=True)
    doc.close()
    tmp.replace(pdf_path)


def build_timeline():
    data = load_js(ROOT / "assets/timeline-data.js")
    eras = {e["id"]: e for e in data["eras"]}
    events = sorted(data["events"], key=lambda e: (e["year"], e["date"]))
    parts = [f"""<!doctype html><html lang="zh-CN"><head><meta charset="utf-8">
<title>政治时间轴 1840–2026</title><style>{PRINT_CSS}</style></head><body>
<div class="cover"><div class="kicker">POLITICS TIMELINE · 2027</div>
<h1>政治时间轴<br>1840 — 2026</h1>
<p class="lead">从鸦片战争到“十五五”，按阶段记忆时间顺序、会议内容与意义；每个节点在网页版都能跳到对应考点。</p>
<div class="meta"><div><b>{len(events)}</b>个节点</div><div><b>{len(data['eras'])}</b>个阶段</div><div><b>1840–2026</b>时间跨度</div></div></div>"""]
    for era in data["eras"]:
        items = [e for e in events if e["era"] == era["id"]]
        if not items:
            continue
        parts.append(f'<div class="era">{esc(era["name"])} · {esc(era["range"])}</div>')
        for e in items:
            tags = " / ".join(l["label"] for l in (e.get("links") or []))
            parts.append(f'<div class="ev"><div class="date">{esc(e["date"])}</div><div>'
                         f'<h3>{esc(e["title"])}</h3><p>{esc(e["summary"])}</p>'
                         f'<div class="tags">{esc(tags)}</div></div></div>')
    parts.append('<p class="note">时间以常用教材口径整理；对应考点可在网页版时间轴点击进入。807 大纲与真题口径见材力总览。</p>')
    parts.append("</body></html>")
    html_path = ROOT / "content" / "_timeline_print.html"
    html_path.write_text("".join(parts), encoding="utf-8")
    pdf = ROOT / "pdf" / "politics-timeline.pdf"
    print_pdf(html_path, pdf)
    postprocess(pdf, "../timeline.html", "政治时间轴 1840–2026")
    print("timeline pdf", pdf.stat().st_size // 1024, "KB")


def build_vocab_topics():
    data = load_js(ROOT / "assets/vocab-data.js")
    topics = data["topics"]
    total = sum(len(g["words"]) for t in topics for g in t["groups"])
    parts = [f"""<!doctype html><html lang="zh-CN"><head><meta charset="utf-8">
<title>英语一 专题词汇</title><style>{PRINT_CSS}</style></head><body>
<div class="cover"><div class="kicker">VOCABULARY · 2027</div>
<h1>英语一 · 专题词汇</h1>
<p class="lead">按做题场景重组的词库：阅读态度、近义辨析、常见话题、逻辑关系、熟词僻义、写作替换。共 {len(topics)} 个专题、{total} 词。</p>
<div class="meta"><div><b>{total}</b>词条</div><div><b>{len(topics)}</b>专题</div><div><b>2027</b>大纲配套</div></div></div>"""]
    for t in topics:
        parts.append(f'<section class="topic"><div class="kicker">{esc(t["id"].upper())}</div>'
                     f'<h2>{esc(t["title"])}</h2><p class="tintro">{esc(t["intro"])}</p>')
        for g in t["groups"]:
            parts.append(f'<div class="group"><h3>{esc(g["name"])}</h3>'
                         + (f'<p class="gnote">{esc(g["note"])}</p>' if g.get("note") else "")
                         + '<div class="words">')
            for w in g["words"]:
                parts.append(f'<div class="w"><b>{esc(w["w"])}</b> <span class="m">{esc(w["m"])}</span>'
                             + (f'<span class="n">{esc(w["note"])}</span>' if w.get("note") else "")
                             + "</div>")
            parts.append("</div></div>")
        parts.append("</section>")
    parts.append('<p class="note">配套网页版可逐词发音、标记生词并进入自测；词表按 2027 英语（一）大纲校对。</p></body></html>')
    html_path = ROOT / "content" / "_vocab_topics_print.html"
    html_path.write_text("".join(parts), encoding="utf-8")
    pdf = ROOT / "pdf" / "vocab-topics.pdf"
    print_pdf(html_path, pdf)
    postprocess(pdf, "../vocab.html", "英语一 专题词汇")
    print("vocab topics pdf", pdf.stat().st_size // 1024, "KB")


def build_vocab_syllabus():
    data = load_js(ROOT / "assets/vocab-data.js")
    words = sorted(data["words"], key=lambda w: (w["w"][0].lower(), w["w"].lower()))
    groups = {}
    for w in words:
        groups.setdefault(w["w"][0].upper(), []).append(w)
    meta = data["meta"]
    parts = [f"""<!doctype html><html lang="zh-CN"><head><meta charset="utf-8">
<title>2027 英语一 大纲词汇表</title><style>{PRINT_CSS}</style></head><body>
<div class="cover"><div class="kicker">SYLLABUS VOCABULARY · 2027</div>
<h1>2027 大纲词汇表</h1>
<p class="lead">共 {meta['total']} 词，按字母排序。相较上一版仅两处拼写规范化：humorous、counterexample；题型与分值不变。</p>
<div class="meta"><div><b>{meta['total']}</b>词</div><div><b>{len(groups)}</b>字母组</div><div><b>2027</b>大纲</div></div></div>"""]
    for letter in sorted(groups):
        parts.append(f'<div class="letter">{esc(letter)}</div><div class="cols">')
        for w in groups[letter]:
            z = f'<span class="z">真{w["z"]}</span>' if w.get("z") else ""
            note = f'<span class="n">{esc(w["n"])}</span>' if w.get("n") else ""
            parts.append(f'<div class="entry"><b>{esc(w["w"])}</b> {esc(w["m"])}{z}{note}</div>')
        parts.append("</div>")
    parts.append('<p class="note">词表整理自 exam-data/NETEMVocabulary，按 2027 大纲校对；数据 CC BY-NC-SA 4.0。网页版支持发音、标记与自测。</p></body></html>')
    html_path = ROOT / "content" / "_vocab_syllabus_print.html"
    html_path.write_text("".join(parts), encoding="utf-8")
    pdf = ROOT / "pdf" / "vocab-syllabus.pdf"
    print_pdf(html_path, pdf)
    postprocess(pdf, "../vocab.html", "2027 英语一 大纲词汇表")
    print("vocab syllabus pdf", pdf.stat().st_size // 1024, "KB")


if __name__ == "__main__":
    build_timeline()
    build_vocab_topics()
    build_vocab_syllabus()
