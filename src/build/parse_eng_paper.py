# -*- coding: utf-8 -*-
"""Parse an English (一) paper into 52 question records.

Input can be the PDF text layer, or OCR text files for scanned years
(--ocr <dir>).
"""
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]


def page_text(path):
    import pymupdf
    return "\n".join(pg.get_text() for pg in pymupdf.open(str(path)))


def ocr_text(dirpath):
    import glob
    files = sorted(glob.glob(str(Path(dirpath) / "*.txt")))
    return "\n".join(open(f, encoding="utf-8-sig").read() for f in files)


def norm_cn(t):
    for a, b in [(r"(?<=[一-鿿])\s+(?=[一-鿿])", ""),
                 (r"(?<=[一-鿿])\s+(?=[，。；：、！？（）【】])", ""),
                 (r"(?<=[，。；：、！？（）【】])\s+(?=[一-鿿])", "")]:
        t = re.sub(a, b, t)
    return t


def reflow(s):
    paras = re.split(r"\n\s*\n", s.strip())
    return "\n\n".join(" ".join(p.split()) for p in paras if p.strip())


def cut(text, start, end):
    a = re.search(start, text, re.I)
    if not a:
        return ""
    b = re.search(end, text[a.end():], re.I)
    return text[a.end(): a.end() + b.start()] if b else text[a.end():]


def parse_cloze(paper):
    body = cut(paper, r"Section\s*(I|Ⅰ)(?![A-Za-z])", r"Section\s*(II|Ⅱ)")
    m = re.search(r"(?:^|\n)\s*1\s*[.．]?\s*\[A\]", body)
    if not m:
        return [], ""
    passage = re.sub(r"Directions:.*?points\)", "", body[: m.start()], flags=re.S | re.I)
    rest = body[m.start():]
    toks = [(x.group(1), x.group(2).strip(), x.start()) for x in
            re.finditer(r"\[([A-D])[J\]】]\s*([^\n\[]*)", rest)]
    cols = {L: [t for Ld, t, _ in toks if Ld == L] for L in "ABCD"}
    marks = list(re.finditer(r"(?:^|\n)\s*(\d{1,2})\s*[.．]?\s*\[A\]", rest))
    by_q = {}
    for i, mm in enumerate(marks):
        n = int(mm.group(1))
        end = marks[i + 1].start() if i + 1 < len(marks) else len(rest)
        seg = rest[mm.start():end]
        opts = {}
        for x in re.finditer(r"\[([A-D])[J\]】]\s*([^\n\[]*)", seg):
            opts.setdefault(x.group(1), x.group(2).strip())
        if len(opts) < 4:
            idx = i
            opts = {L: (cols[L][idx] if idx < len(cols[L]) else "") for L in "ABCD"}
        by_q[n] = opts
    items = []
    for n in range(1, 21):
        opts = by_q.get(n, {})
        if len(opts) < 4 or not all(opts.get(L) for L in "ABCD"):
            continue
        items.append({"n": n, "kind": "完形", "text": f"第{n}空",
                      "options": "\n".join(f"{L}. {opts[L]}" for L in "ABCD"),
                      "passage": reflow(passage)})
    return items, reflow(passage)


def parse_reading(paper):
    body = cut(paper, r"(?<![A-Za-z])Part\s*A(?![A-Za-z])", r"(?<![A-Za-z])Part\s*B(?![A-Za-z])")
    items = []
    for m in re.finditer(r"Text\s*([1-4])\b", body):
        k = int(m.group(1))
        seg = body[m.end():]
        nxt = re.search(r"Text\s*[1-4]\b", seg)
        seg = seg[: nxt.start()] if nxt else seg
        qs = list(re.finditer(r"(?:^|\n)\s*(\d{2})\s*[.．]\s*(.*)", seg))
        qs = [q for q in qs if 21 <= int(q.group(1)) <= 40]
        if not qs:
            continue
        passage = seg[: qs[0].start()]
        for i, qm in enumerate(qs):
            n = int(qm.group(1))
            end = qs[i + 1].start() if i + 1 < len(qs) else len(seg)
            chunk = seg[qm.start():end]
            opts = re.findall(r"\[([A-D])[J\]】]\s*([^\n\[]*)", chunk)
            if len(opts) < 4:
                eopts = re.findall(r"\[([E-H])[J\]】]\s*([^\n\[]*)", chunk)
                opts = [(chr(ord(L) - 4), t) for L, t in eopts]
            if len(opts) < 4:
                continue
            stem = chunk.split("[A]")[0]
            stem = re.sub(r"^\s*\d{2}\s*[.．]\s*", "", stem)
            items.append({"n": n, "kind": "阅读", "text": " ".join(stem.split()),
                          "options": "\n".join(f"{L}. {t.strip()}" for L, t in opts[:4]),
                          "passage": reflow(f"Text {k}\n{passage}")})
    return items


def parse_partb(paper):
    body = cut(paper, r"(?<![A-Za-z])Part\s*B(?![A-Za-z])", r"(?<![A-Za-z])Part\s*C(?![A-Za-z])")
    if not body:
        return []
    opt_start = re.search(r"(?:^|\n)\s*\[A\]", body)
    if not opt_start:
        return []
    head, opt_block = body[: opt_start.start()], body[opt_start.start():]
    opts = []
    for x in re.finditer(r"\[([A-G])\][J\]】]?\s*((?:(?!\[[A-G]\]).)*)", opt_block, re.S):
        opts.append((x.group(1), " ".join(x.group(2).split())))
    opt_text = "\n".join(f"{L}. {t}" for L, t in opts)
    qs = list(re.finditer(r"(?:^|\n)\s*(4[1-5])\s*[.．]\s*(.*)", head))
    items = []
    if qs:
        for i, qm in enumerate(qs):
            n = int(qm.group(1))
            end = qs[i + 1].start() if i + 1 < len(qs) else len(head)
            items.append({"n": n, "kind": "新题型",
                          "text": " ".join(head[qm.start():end].split()),
                          "options": opt_text, "passage": reflow(opt_text)})
    else:
        for n in range(41, 46):
            items.append({"n": n, "kind": "新题型", "text": f"第{n}空（从 A-G 中选段）",
                          "options": opt_text, "passage": reflow(opt_text)})
    return items


def parse_translation(paper):
    body = cut(paper, r"(?<![A-Za-z])Part\s*C(?![A-Za-z])", r"Section\s*(III|Ⅲ)")
    if not body:
        return []
    items = []
    for m in re.finditer(r"\(\s*(4[6-9]|50)\s*\)\s*(.*?)(?=\(\s*(?:4[6-9]|50)\s*\)|\Z)", body, re.S):
        n = int(m.group(1))
        items.append({"n": n, "kind": "翻译", "text": f"({n}) {' '.join(m.group(2).split())}",
                      "options": "", "passage": reflow(re.sub(r"\(\s*(?:4[6-9]|50)\s*\).*", "", body, flags=re.S))})
    return items


def parse_writing(paper):
    body = paper[paper.rfind("Section III"):] if "Section III" in paper else paper[paper.rfind("Section"):]
    body = re.sub(r"Section\s*III", "Section III", body)
    items = []
    a = re.search(r"Part\s*A", body)
    if a:
        seg = body[a.start():]
        b = re.search(r"Part\s*B", seg[5:])
        seg = seg[: b.start() + 5] if b else seg
        items.append({"n": 51, "kind": "小作文", "text": " ".join(seg.split()),
                      "options": "", "passage": ""})
    b = re.search(r"Part\s*B", body)
    if b:
        items.append({"n": 52, "kind": "大作文", "text": " ".join(body[b.start():].split()),
                      "options": "", "passage": ""})
    return items


def parse(paper):
    cloze, _ = parse_cloze(paper)
    items = cloze + parse_reading(paper) + parse_partb(paper) + parse_translation(paper) + parse_writing(paper)
    return sorted(items, key=lambda x: x["n"])


if __name__ == "__main__":
    src = sys.argv[1]
    if src.startswith("ocr:"):
        paper = norm_cn(ocr_text(src[4:]))
    else:
        paper = page_text(src)
    its = parse(paper)
    nums = sorted(i["n"] for i in its)
    print(len(its), "missing", [n for n in range(1, 53) if n not in nums])
    for it in its[:2] + its[20:22] + its[-2:]:
        print(it["n"], it["kind"], it["text"][:60], "|opts", len(it["options"].split("\n")))
