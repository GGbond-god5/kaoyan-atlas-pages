# -*- coding: utf-8 -*-
"""Render a chapter JSON into a print-ready HTML page."""
import html
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]

SUBJECT_META = {
    "math":      {"name": "数学一", "en": "MATHEMATICS I", "color": "#1F3A5F", "soft": "#E7ECF3"},
    "english":   {"name": "英语一", "en": "ENGLISH I", "color": "#5B3A6B", "soft": "#EEE8F2"},
    "mechanics": {"name": "807 材料力学", "en": "MECHANICS OF MATERIALS", "color": "#8A4B2A", "soft": "#F2E9E1"},
    "politics":  {"name": "政治", "en": "POLITICS", "color": "#A02C2C", "soft": "#F5E6E3"},
}

TAG_CLASS = {
    "高频": "hot", "必考": "hot", "核心": "core",
    "中频": "mid", "低频": "low", "了解": "low", "冷门": "low",
}

PRIORITY_LABEL = {"S": "S 级 · 必须拿下", "A": "A 级 · 重点掌握", "B": "B 级 · 覆盖即可"}



def normalize_tex(t):
    """Repair over-escaped LaTeX coming from JSON authoring."""
    t = str(t)
    t = re.sub(r"\\{2,}(?=[A-Za-z])", r"\\", t)
    for a, b in ((r"\\(", r"\("), (r"\\)", r"\)"), (r"\\[", r"\["), (r"\\]", r"\]")):
        t = t.replace(a, b)
    return t


def esc(t):
    return html.escape(str(t), quote=False)


def inline(t):
    """Escape text but keep our tiny markup: **bold** and line breaks."""
    t = esc(normalize_tex(t))
    t = re.sub(r"\*\*(.+?)\*\*", r"<strong>\1</strong>", t)
    return t.replace("\n", "<br>")


def math(t):
    """Plain text that may contain LaTeX delimiters; leave it for KaTeX."""
    return esc(normalize_tex(t))


def tag(text, extra=""):
    cls = TAG_CLASS.get(text, "plain")
    return f'<span class="tag tag-{cls} {extra}">{esc(text)}</span>'


def render_formula(f):
    if isinstance(f, str):
        body, note = f, ""
    else:
        body, note = f.get("tex", ""), f.get("note", "")
    note_html = f'<span class="f-note">{inline(note)}</span>' if note else ""
    return f'<div class="f-row"><span class="f-tex">{math(body)}</span>{note_html}</div>'




FIG_CACHE = {}


def figure(figs):
    if not figs:
        return ""
    parts = []
    for f in figs:
        src = f.get("src", "") if isinstance(f, dict) else str(f)
        caption = f.get("caption", "") if isinstance(f, dict) else ""
        cap = f'<figcaption>{inline(caption)}</figcaption>' if caption else ""
        path = ROOT / "assets" / "figs" / f"{src}.svg"
        if not path.exists():
            # Raster originals (e.g. cropped exam-paper figures) are referenced
            # by filename with extension and served from assets/figs/.
            raster = ROOT / "assets" / "figs" / src
            if "." in src and raster.exists():
                parts.append(f'<figure class="kfig"><img src="assets/figs/{src}" alt="题图">{cap}</figure>')
            continue
        if src not in FIG_CACHE:
            svg = path.read_text(encoding="utf-8")
            svg = re.sub(r"<\?xml[^>]*\?>", "", svg).strip()
            FIG_CACHE[src] = svg
        parts.append(f'<figure class="kfig">{FIG_CACHE[src]}{cap}</figure>')
    return "".join(parts)


def render_kp(kp, idx, web=False, ch=None):
    tags = "".join(tag(t) for t in ([kp.get("level")] if kp.get("level") else []) + ([kp.get("freq")] if kp.get("freq") else []))
    formulas = ""
    if kp.get("formulas"):
        formulas = '<div class="formulas">' + "".join(render_formula(f) for f in kp["formulas"]) + "</div>"
    figs = figure(kp.get("figures"))

    exams = ""
    if kp.get("exams"):
        items = []
        for e in kp["exams"]:
            src = e.get("source") or ""
            year = e.get("year") or ""
            mark = "真题" if year else "同型"
            disp = src
            if not year and "同型" in src:
                disp = src.replace("真题", "").replace("同型", "").strip(" ·")
            tag_txt = (f"{year} · {disp}" if year else (f"· {disp}" if disp else "")).strip(" ·")
            head = (f'<div class="exam-label"><span class="exam-mark{"" if year else " alt"}">{mark}</span>'
                    f'{(" " + esc(tag_txt)) if tag_txt else ""}</div>')
            ans = ""
            steps_html = ""
            if e.get("steps"):
                steps_html = ('<div class="exam-sol"><div class="sol-label">完整解答</div><ol class="exam-steps">'
                              + "".join(f"<li>{inline(x)}</li>" for x in e["steps"]) + "</ol></div>")
            if e.get("answer") or steps_html:
                body = (f'<div class="exam-ans"><b>要点</b> {inline(e.get("answer", ""))}</div>'
                        if e.get("answer") else "") + steps_html
                if web:
                    ans = ('<details class="exam-details"><summary><i class="tri"></i>'
                           '<span class="open-txt">展开解析</span><span class="close-txt">收起解析</span></summary>'
                           + body + '</details>')
                else:
                    ans = body
            efigs = figure(e.get("figures"))
            items.append(f'<div class="exam">{head}{efigs}<p class="exam-q">{inline(e.get("text", ""))}</p>{ans}</div>')
        exams = "".join(items)

    pitfalls = ""
    if kp.get("pitfalls"):
        pitfalls = '<div class="pitfall"><span class="side-label">易错</span><ul>' + "".join(f"<li>{inline(p)}</li>" for p in kp["pitfalls"]) + "</ul></div>"

    teachers = ""
    if kp.get("teachers"):
        rows = "".join(f'<span class="t-item"><b>{esc(t.get("name", ""))}</b>{inline(t.get("note", ""))}</span>' for t in kp["teachers"])
        teachers = f'<div class="teacher"><span class="side-label">讲法</span><div class="t-list">{rows}</div></div>'

    bank = ""
    if web and ch:
        kid = kp.get("id") or f"kp-{idx:02d}"
        bank = (f'<div class="kp-tools"><a class="kp-bank" href="#" hidden '
                f'data-bank-subject="{esc(ch.get("subject", ""))}" '
                f'data-bank-chapter="{esc(ch.get("id", ""))}" '
                f'data-bank-kp="{esc(kid)}">去题库练这个考点 →</a></div>')

    return f'''
<article class="kp" id="{esc(kp.get("id") or f"kp-{idx:02d}")}">
  <span class="anchor">[[K-{esc(kp.get("id") or f"kp-{idx:02d}")}]]</span>
  <div class="kp-head">
    <span class="kp-no">{idx:02d}</span>
    <h2>{inline(kp.get("name", ""))}</h2>
    <span class="kp-tags">{tags}</span>
  </div>
  <p class="kp-core">{inline(kp.get("core", ""))}</p>
  {figs}
  {formulas}
  {exams}
  {pitfalls}
  {teachers}
  {bank}
</article>'''


def render_topic(tp, idx, web=False):
    steps = ""
    if tp.get("method"):
        steps = '<ol class="method">' + "".join(f"<li>{inline(s)}</li>" for s in tp["method"]) + "</ol>"
    example = ""
    if tp.get("example"):
        ex = tp["example"]
        if isinstance(ex, dict):
            q = inline(ex.get("q", ""))
            a = inline(ex.get("a", ""))
            if web:
                sol = ('<details class="exam-details"><summary><i class="tri"></i>'
                       '<span class="open-txt">展开解析</span><span class="close-txt">收起解析</span></summary>'
                       f'<p class="t-ans"><b>解</b> {a}</p></details>')
            else:
                sol = f'<p class="t-ans"><b>解</b> {a}</p>'
            example = f'<div class="t-example"><div class="t-example-label">例</div><p>{q}</p>{sol}</div>'
        else:
            example = f'<div class="t-example"><div class="t-example-label">例</div><p>{inline(ex)}</p></div>'
    trap = f'<div class="t-trap"><b>踩坑点</b> {inline(tp["trap"])}</div>' if tp.get("trap") else ""
    why = f'<p class="t-why">{inline(tp["why"])}</p>' if tp.get("why") else ""
    figs = figure(tp.get("figures"))
    return f'''
<section class="topic" id="{esc(tp.get("id") or f"topic-{idx:02d}")}">
  <span class="anchor">[[T-{esc(tp.get("id") or f"topic-{idx:02d}")}]]</span>
  <div class="topic-head">
    <span class="topic-kicker">专题 {idx:02d}</span>
    <h2>{inline(tp.get("name", ""))}</h2>
  </div>
  {why}
  {figs}
  {steps}
  {example}
  {trap}
</section>'''


def render_summary(s):
    if not s:
        return ""
    def lst(arr, cls):
        if not arr:
            return ""
        return '<ul class="%s">%s</ul>' % (cls, "".join(f"<li>{inline(x)}</li>" for x in arr))
    blocks = []
    if s.get("must"):
        blocks.append(f'<div class="sum-col"><h3>必须会</h3>{lst(s["must"], "sum-list")}</div>')
    if s.get("drop"):
        blocks.append(f'<div class="sum-col"><h3>可暂缓</h3>{lst(s["drop"], "sum-list")}</div>')
    if s.get("checklist"):
        blocks.append(f'<div class="sum-col"><h3>自测清单</h3>{lst(s["checklist"], "sum-list check")}</div>')
    return f'''
<section class="summary" id="summary">
  <span class="anchor">[[S-summary]]</span>
  <div class="summary-head"><span class="section-kicker">CHAPTER SUMMARY</span><h2>本章收口</h2></div>
  <div class="sum-grid">{''.join(blocks)}</div>
</section>'''


CSS = r"""
:root{--paper:#F7F3EA;--paper2:#FCFAF5;--ink:#17161A;--ink2:#49453E;--ink3:#8B857A;
--rule:#D8D0C1;--rule2:#E8E2D6;--accent:#8A4B2A;--accent-soft:#F2E9E1;--vermilion:#A8342A}
*{box-sizing:border-box}
html{-webkit-print-color-adjust:exact;print-color-adjust:exact}
body{margin:0;background:var(--paper);color:var(--ink);
font-family:"Noto Sans SC","Source Han Sans CN","Microsoft YaHei",sans-serif;
font-size:9.6pt;line-height:1.72;letter-spacing:.01em}
@page{size:A4;margin:20mm 16mm 16mm}
.serif{font-family:"Noto Serif SC","Source Han Serif SC",STSong,SimSun,serif}

main{padding-bottom:2mm}

/* cover */
.cover{padding:2mm 0 7mm;border-bottom:1.2pt solid var(--ink);margin-bottom:3mm}
.cover-top{display:flex;justify-content:space-between;align-items:baseline;font-size:7pt;
letter-spacing:.22em;color:var(--ink3);text-transform:uppercase}
.cover-top .c-code{color:var(--accent);font-weight:600}
.cover h1{font-family:"Noto Serif SC","Source Han Serif SC",STSong,serif;font-size:30pt;font-weight:700;
line-height:1.18;margin:4mm 0 2mm;letter-spacing:.02em}
.cover-sub{font-size:10pt;color:var(--ink2);margin:0 0 4mm;max-width:150mm}
.cover-meta{display:flex;gap:3mm;flex-wrap:wrap;margin-bottom:4mm}
.meta-pill{font-size:7.4pt;letter-spacing:.06em;border:.6pt solid var(--rule);border-radius:999px;
padding:1.4mm 3.4mm;color:var(--ink2)}
.meta-pill b{color:var(--ink)}
.meta-pill.acc{border-color:var(--accent);color:var(--accent);background:var(--accent-soft)}
.syllabus{background:var(--paper2);border-left:2.2pt solid var(--accent);padding:3.4mm 4mm;
font-size:8.6pt;color:var(--ink2)}
.syllabus .sl-label{display:block;font-size:6.8pt;letter-spacing:.2em;color:var(--accent);
margin-bottom:1.4mm;font-weight:600}
.syllabus ul{margin:0;padding-left:4.2mm;column-count:2;column-gap:7mm}
.syllabus li{margin:0 0 .8mm;break-inside:avoid}
.disclaimer{margin:3mm 0 0;font-size:7.2pt;color:var(--ink3);letter-spacing:.02em}
.kfig{margin:3mm 0;break-inside:avoid}
.kfig svg{display:block;width:100%;height:auto;border:.4pt solid var(--rule2);background:var(--paper2)}
.kfig img{display:block;max-width:100%;height:auto;border:.4pt solid var(--rule2);background:#fff}
.kfig figcaption{font-size:6.7pt;color:var(--ink3);margin-top:1.2mm;letter-spacing:.04em}

/* section kicker */
.section-kicker{display:block;font-size:7pt;letter-spacing:.24em;color:var(--ink3);margin-bottom:1mm}

/* knowledge point */
.kp{padding:6mm 0 5mm;border-bottom:.6pt solid var(--rule2)}
.kp-head{display:flex;align-items:baseline;gap:3mm;margin-bottom:2.6mm;break-after:avoid;break-inside:avoid}
.kp-no{font-family:"Noto Serif SC",serif;font-size:11pt;color:var(--accent);font-weight:700;
letter-spacing:.02em;min-width:8mm}
.kp-head h2{font-family:"Noto Serif SC","Source Han Serif SC",STSong,serif;font-size:15.5pt;
font-weight:700;margin:0;line-height:1.35;flex:1}
.kp-tags{display:flex;gap:1.4mm;flex-wrap:wrap}
.tag{font-size:6.6pt;letter-spacing:.08em;padding:.9mm 2.2mm;border-radius:2mm;
border:.5pt solid var(--rule);color:var(--ink3);white-space:nowrap}
.tag-hot{background:var(--vermilion);border-color:var(--vermilion);color:#fff}
.tag-core{background:#1F1B16;border-color:#1F1B16;color:#fff}
.tag-mid{background:var(--accent-soft);border-color:#D9C3B2;color:var(--accent)}
.kp-core{margin:0 0 2.4mm;color:var(--ink2)}
.kp-core strong{color:var(--ink)}

.formulas{background:var(--paper2);border:.5pt solid var(--rule2);padding:2.6mm 3.4mm;margin:0 0 3mm}
.f-row{display:flex;gap:4mm;align-items:baseline;padding:1.1mm 0}
.f-row+.f-row{border-top:.4pt dotted var(--rule)}
.f-tex{font-family:"Latin Modern Math",Cambria Math,"Times New Roman",serif;font-size:10.4pt;
color:#111;min-width:62mm}
.f-note{font-size:7.8pt;color:var(--ink3)}

.exam{border-left:2.2pt solid var(--vermilion);background:#FCF7F3;padding:2.6mm 3.6mm 3mm;
margin:0 0 2.6mm;break-inside:avoid}
.exam-label{font-size:6.8pt;letter-spacing:.16em;color:var(--vermilion);margin-bottom:1.2mm;
display:flex;align-items:center;gap:2mm}
.exam-mark{background:var(--vermilion);color:#fff;padding:.5mm 1.8mm;border-radius:1mm;
letter-spacing:.08em}
.exam-mark.alt{background:var(--ink3)}
.exam-q{margin:0 0 1.4mm;font-size:9.2pt}
.exam-ans{font-size:8.4pt;color:var(--ink2)}
.exam-ans b{color:var(--vermilion);font-weight:600;margin-right:1.4mm}
.exam .kfig{margin:1.2mm 0 2.2mm}
.exam-sol{margin-top:1.8mm;padding-top:1.6mm;border-top:.4pt dashed rgba(168,52,42,.3)}
.sol-label{font-size:6.4pt;letter-spacing:.16em;color:var(--vermilion);margin-bottom:1mm}
.exam-steps{margin:0;padding-left:4.2mm;font-size:8.4pt;line-height:1.75;color:var(--ink2)}
.exam-steps li{margin-bottom:1mm}
.exam-steps li::marker{color:var(--vermilion)}

.side-label{display:inline-block;font-size:6.6pt;letter-spacing:.14em;color:var(--ink3);
border:.5pt solid var(--rule);padding:.5mm 1.8mm;border-radius:1mm;margin-right:2.4mm;
vertical-align:2pt}
.pitfall{margin:0 0 2mm;font-size:8.6pt;color:var(--ink2)}
.pitfall ul{margin:0;padding-left:4mm;display:inline}
.pitfall li{margin-bottom:.6mm}
.teacher{font-size:8.2pt;color:var(--ink3)}
.t-list{display:inline-flex;flex-direction:column;gap:.8mm;vertical-align:top;width:calc(100% - 18mm)}
.t-item b{color:var(--ink2);font-weight:600;margin-right:1.8mm}

/* topic */
.topic{padding:7mm 0 5mm;border-bottom:.6pt solid var(--rule2);break-inside:avoid}
.topic-head{display:flex;align-items:baseline;gap:3.4mm;margin-bottom:2.4mm}
.topic-kicker{font-size:7pt;letter-spacing:.18em;color:#fff;background:var(--accent);
padding:1mm 2.6mm;border-radius:1mm;white-space:nowrap}
.topic-head h2{font-family:"Noto Serif SC",serif;font-size:15pt;margin:0;line-height:1.35}
.t-why{margin:0 0 3mm;color:var(--ink2)}
.method{margin:0 0 3mm;padding-left:5mm;font-size:8.8pt}
.method li{margin-bottom:1.2mm}
.t-example{background:var(--paper2);border:.5pt solid var(--rule);padding:3mm 3.6mm;margin-bottom:2.4mm}
.t-example-label{font-size:6.6pt;letter-spacing:.2em;color:var(--accent);margin-bottom:1mm}
.t-example p{margin:0 0 1.4mm;font-size:8.8pt}
.t-ans{color:var(--ink2)}
.t-ans b{color:var(--accent)}
.t-trap{font-size:8.4pt;color:var(--ink2);border-top:.4pt dotted var(--rule);padding-top:2mm}
.t-trap b{color:var(--vermilion);margin-right:1.6mm}

/* summary */
.summary{padding:7mm 0 2mm;break-inside:avoid}
.summary-head{display:flex;align-items:baseline;gap:3mm;margin-bottom:3mm}
.summary-head h2{font-family:"Noto Serif SC",serif;font-size:15pt;margin:0}
.sum-grid{display:grid;grid-template-columns:1fr 1fr 1fr;gap:5mm}
.sum-col h3{font-size:7pt;letter-spacing:.18em;color:var(--accent);margin:0 0 1.6mm;
padding-bottom:1.2mm;border-bottom:.6pt solid var(--rule);font-weight:600}
.sum-list{margin:0;padding-left:3.8mm;font-size:7.9pt;color:var(--ink2);line-height:1.6}
.sum-list li{margin-bottom:1mm}
.sum-list.check{list-style:none;padding-left:0}
.sum-list.check li{padding-left:4.6mm;position:relative}
.sum-list.check li:before{content:"";position:absolute;left:0;top:1.5mm;width:2.4mm;height:2.4mm;
border:.6pt solid var(--ink3);border-radius:.4mm}

/* misc */
.anchor{font-size:1px;color:#F7F3EA;line-height:0;letter-spacing:0}
.prio-band{display:flex;gap:0;margin:0 0 5mm;border:.5pt solid var(--rule)}
.prio-band div{flex:1;padding:2.2mm 3mm;font-size:7.4pt;color:var(--ink3);line-height:1.5}
.prio-band div+div{border-left:.5pt solid var(--rule)}
.prio-band b{display:block;color:var(--ink);font-size:8pt;letter-spacing:.06em}
"""


def build_fragment(ch, web=False):
    sid = ch["subject"]
    meta = SUBJECT_META[sid]
    kps_html = "".join(render_kp(kp, i + 1, web=web, ch=ch) for i, kp in enumerate(ch.get("kps", [])))
    topics_html = "".join(render_topic(tp, i + 1, web=web) for i, tp in enumerate(ch.get("topics", [])))
    syl = ""
    if ch.get("syllabus"):
        syl = '<div class="syllabus"><span class="sl-label">大纲要求 · SYLLABUS</span><ul>' +               "".join(f"<li>{inline(x)}</li>" for x in ch["syllabus"]) + "</ul></div>"
    tags = "".join(f'<span class="meta-pill">{esc(x)}</span>' for x in ch.get("meta", []))
    prio = ch.get("priority")
    prio_pill = f'<span class="meta-pill acc">{esc(PRIORITY_LABEL.get(prio, prio))}</span>' if prio else ""
    topic_anchor = '<div class="topic-divider" id="topics"></div>' if topics_html else ""
    summary_html = render_summary(ch.get("summary"))
    return f"""  <section class="cover">
    <div class="cover-top"><span class="c-code">{esc(ch.get('code',''))}</span><span>{esc(meta['en'])}</span></div>
    <h1>{inline(ch['title'])}</h1>
    <p class="cover-sub">{inline(ch.get('subtitle',''))}</p>
    <div class="cover-meta">{prio_pill}{tags}</div>
    {syl}
    <p class="disclaimer">真题标注：标明年份与题号者为原卷原题；标「同型」者为同考点真题风格改编，用于对位训练。</p>
  </section>
  {kps_html}
  {topic_anchor}
  {topics_html}
  {summary_html}"""


def build_chapter(ch):
    sid = ch["subject"]
    meta = SUBJECT_META[sid]
    accent = meta["color"]
    accent_soft = meta["soft"]
    css = CSS.replace("--accent:#8A4B2A", f"--accent:{accent}").replace("--accent-soft:#F2E9E1", f"--accent-soft:{accent_soft}")
    return f"""<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<title>{esc(meta['name'])} · {esc(ch['title'])}</title>
<link rel="stylesheet" href="../assets/katex/katex.min.css">
<style>{css}</style>
<script defer src="../assets/katex/katex.min.js"></script>
<script defer src="../assets/katex/contrib/auto-render.min.js"
 onload="renderMathInElement(document.body,{{delimiters:[{{left:'\\\\(',right:'\\\\)',display:false}},{{left:'\\\\[',right:'\\\\]',display:true}}],throwOnError:false}})"></script>
</head>
<body>
<main>
{build_fragment(ch, web=False)}
</main>
</body>
</html>"""


def main():
    if len(sys.argv) < 2:
        print("usage: render.py <chapter.json> [out.html]")
        return
    path = Path(sys.argv[1])
    ch = json.loads(path.read_text(encoding="utf-8"))
    out = Path(sys.argv[2]) if len(sys.argv) > 2 else ROOT / "content" / f"{path.stem}.html"
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(build_chapter(ch), encoding="utf-8")
    print(f"rendered {out}  ({out.stat().st_size} bytes)")


if __name__ == "__main__":
    main()
