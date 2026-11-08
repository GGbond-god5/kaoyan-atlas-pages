# -*- coding: utf-8 -*-
"""Parse English (一) papers 2010-2024 text layers into per-year JSON skeletons."""
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
PAPER_DIR = ROOT / "bank/eng-zhenti/03、2010-2024年考研英语真题+解析/2010-2024考研英语真题"
OUT = ROOT / "src" / "bank"


def text_of(path):
    import pymupdf
    return "\n".join(pg.get_text() for pg in pymupdf.open(str(path)))


def reflow(s):
    paras = re.split(r"\n\s*\n", s.strip())
    return "\n\n".join(" ".join(p.split()) for p in paras if p.strip())


def clean_lines(text):
    out = []
    for ln in text.split("\n"):
        s = re.sub(r"[ \t]+", " ", ln).strip()
        if not s or re.fullmatch(r"-?\s*\d{1,3}\s*-?", s):
            continue
        out.append(s)
    return out


def cut(text, start, end):
    a = re.search(start, text)
    if not a:
        return ""
    b = re.search(end, text[a.end():])
    return text[a.end(): a.end() + b.start()] if b else text[a.end():]


def parse_cloze(paper):
    body = cut(paper, r"Section\s*(I|Ⅰ)\b", r"Section\s*(II|Ⅱ)")
    m = re.search(r"(?:^|\n)\s*1\s*\.?\s*\[A\]", body)
    if not m:
        return [], ""
    passage = re.sub(r"Directions:.*?points\)", "", body[: m.start()], flags=re.S)
    rest = body[m.start():]
    # question markers: "1. [A]", "10.[A]", possibly without dot
    markers = list(re.finditer(r"(?:^|\n)\s*(\d{1,2})\s*\.?\s*\[A\]", rest))
    marks = [(int(x.group(1)), x.start(), x.end()) for x in markers]
    if not marks:
        return [], reflow(passage)
    # block layout when the next token after [A] is [B] of the same question
    block = True
    tokens = [(x.group(1), x.group(2).strip(), x.start())
              for x in re.finditer(r"\[([A-D])\]\s*([^\n\[]*)", rest)]
    by_q = {}
    if marks:
        first_end = marks[0][2]
        nxt = [t for t in tokens if t[2] >= first_end]
        if nxt and nxt[0][0] == "A" and marks[0][2] > tokens[0][2]:
            block = False
    if block:
        for i, (n, a, b) in enumerate(marks):
            end = marks[i + 1][1] if i + 1 < len(marks) else len(rest)
            seg = rest[a:end]
            opts = {x.group(1): x.group(2).strip() for x in re.finditer(r"\[([A-D])\]\s*([^\n\[]*)", seg)}
            by_q[n] = opts
    else:
        cols = {}
        for letter, txt, pos in tokens:
            cols.setdefault(letter, []).append(txt)
        for i, (n, _, _) in enumerate(marks):
            by_q[n] = {L: (cols.get(L) or [""] * 20)[i] for L in "ABCD"}
    items = []
    for n in range(1, 21):
        opts = by_q.get(n, {})
        if len(opts) < 4:
            continue
        items.append({"n": n, "kind": "完形", "text": f"第{n}空",
                      "options": "\n".join(f"{L}. {opts[L]}" for L in "ABCD"),
                      "passage": reflow(passage)})
    return items, reflow(passage)


def parse_reading(paper):
    body = cut(paper, r"Part\s*A", r"Part\s*B")
    items = []
    for m in re.finditer(r"Text\s*([1-4])\b", body):
        k = int(m.group(1))
        seg = body[m.end():]
        nxt = re.search(r"Text\s*[1-4]\b", seg)
        seg = seg[: nxt.start()] if nxt else seg
        qstart = re.search(r"(?:^|\n)\s*2[1-9]\s*\.\s*", seg)
        if not qstart:
            qstart = re.search(r"(?:^|\n)\s*[2-4][0-9]\s*\.\s*", seg)
        if not qstart:
            continue
        passage = seg[: qstart.start()]
        qbody = seg[qstart.start():]
        qs = list(re.finditer(r"(?:^|\n)\s*(\d{2})\s*\.\s*(.*)", qbody))
        for i, qm in enumerate(qs):
            n = int(qm.group(1))
            end = qs[i + 1].start() if i + 1 < len(qs) else len(qbody)
            chunk = qbody[qm.start():end]
            opts = re.findall(r"\[([A-D])\]\s*([^\n\[]*)", chunk)
            if len(opts) < 4:
                continue
            stem = re.sub(r"^\s*\d{2}\s*\.\s*", "", chunk.split("[A]")[0])
            stem = " ".join(stem.split())
            items.append({"n": n, "kind": "阅读", "text": stem,
                          "options": "\n".join(f"{L}. {t.strip()}" for L, t in opts[:4]),
                          "passage": reflow(f"Text {k}\n{passage}")})
    return items


def parse_partb(paper):
    body = cut(paper, r"Part\s*B", r"Part\s*C")
    if not body:
        return []
    opt_start = re.search(r"(?:^|\n)\s*\[A\]", body)
    desc = body[: opt_start.start()] if opt_start else body
    opts = re.findall(r"\[([A-G])\]\s*([^\n\[]*)", body[opt_start.start():] if opt_start else "")
    opt_text = "\n".join(f"{L}. {t.strip()}" for L, t in opts)
    qs = list(re.finditer(r"(?:^|\n)\s*(4[1-5])\s*\.\s*", desc))
    items = []
    for i, qm in enumerate(qs):
        n = int(qm.group(1))
        end = qs[i + 1].start() if i + 1 < len(qs) else len(desc)
        stem = " ".join(desc[qm.start():end].split())
        items.append({"n": n, "kind": "新题型", "text": stem, "options": opt_text,
                      "passage": reflow(opt_text)})
    return items


def parse_translation(paper):
    body = cut(paper, r"Part\s*C", r"Section\s*(III|Ⅲ)")
    if not body:
        return []
    items = []
    for m in re.finditer(r"\((4[6-9]|50)\)\s*(.*?)(?=\((4[6-9]|50)\)|\Z)", body, re.S):
        n = int(m.group(1))
        sent = " ".join(m.group(2).split())
        items.append({"n": n, "kind": "翻译", "text": f"({n}) {sent}", "options": "",
                      "passage": reflow(re.sub(r"\(4[6-9]\).*|\(50\).*", "", body, flags=re.S))})
    return items


def parse_writing(paper):
    body = cut(paper, r"Section\s*(III|Ⅲ)", r"$^")
    if not body:
        body = paper[paper.rfind("Section"):]
    items = []
    a = re.search(r"Part\s*A", body)
    if a:
        seg = body[a.start():]
        b = re.search(r"Part\s*B", seg[5:])
        seg = seg[: b.start() + 5] if b else seg
        items.append({"n": 51, "kind": "小作文", "text": " ".join(seg.split()), "options": "",
                      "passage": ""})
    b = re.search(r"Part\s*B", body)
    if b:
        items.append({"n": 52, "kind": "大作文", "text": " ".join(body[b.start():].split()),
                      "options": "", "passage": ""})
    return items


def parse_year(year):
    paper = text_of(PAPER_DIR / f"{year}年考研英语一真题.pdf")
    cloze, _ = parse_cloze(paper)
    reading = parse_reading(paper)
    partb = parse_partb(paper)
    tr = parse_translation(paper)
    wr = parse_writing(paper)
    items = sorted(cloze + reading + partb + tr + wr, key=lambda x: x["n"])
    return items


if __name__ == "__main__":
    years = [int(x) for x in sys.argv[1:]] or list(range(2010, 2025))
    for y in years:
        try:
            its = parse_year(y)
        except Exception as e:
            print(y, "ERROR", e)
            continue
        nums = sorted(i["n"] for i in its)
        miss = [n for n in range(1, 53) if n not in nums]
        print(y, len(its), "missing", miss)
