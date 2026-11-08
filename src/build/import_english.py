# -*- coding: utf-8 -*-
"""Transcribe a text-layer English (一) paper into imported-eng-<year>.json.

Currently handles 2024, whose paper and answer-key PDFs both have a text layer.
"""
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
YEAR = 2024
PAPER = ROOT / "bank/eng-zhenti/03、2010-2024年考研英语真题+解析/2010-2024考研英语真题/2024年考研英语一真题.pdf"
KEY = ROOT / "bank/eng-zhenti/03、2010-2024年考研英语真题+解析/2010-2024考研英语解析/2024年考研英语一真题解析.pdf"
OUT = ROOT / "src" / "bank" / f"imported-eng-{YEAR}.json"


def text_of(path):
    import pymupdf
    doc = pymupdf.open(str(path))
    return "\n".join(pg.get_text() for pg in doc)


def lines_of(path):
    out = []
    for ln in text_of(path).split("\n"):
        s = re.sub(r"\s+", " ", ln).strip()
        if not s or re.fullmatch(r"-?\s*\d{1,3}\s*-?", s):
            continue
        out.append(s)
    return out


def reflow(text):
    paras = re.split(r"\n\s*\n", text.strip())
    return "\n\n".join(" ".join(p.split()) for p in paras if p.strip())


def parse_key(raw):
    answers = {}
    pat = r"(?:答案[：:]?\s*)?(\d{1,2})\s*[-—–]\s*(\d{1,2})\s*[：:]\s*([A-G](?:\s*[A-G])*)"
    for m in re.finditer(pat, raw):
        a, b, letters = int(m.group(1)), int(m.group(2)), re.sub(r"\s+", "", m.group(3))
        for i, ch in enumerate(letters):
            answers[a + i] = ch
    return answers


def parse_translations(raw):
    res = {}
    for m in re.finditer(r"(\d{1,2})\.\s*【译[文⽂]】(.*?)(?=\n\s*\d{1,2}\.\s*【译|\Z)", raw, re.S):
        res[int(m.group(1))] = re.sub(r"\s+", "", m.group(2))
    return res


def section(raw, start_pat, end_pat):
    a = re.search(start_pat, raw)
    if not a:
        return ""
    b = re.search(end_pat, raw[a.end():])
    return raw[a.end(): a.end() + b.start()] if b else raw[a.end():]


def parse_cloze(paper, key):
    body = section(paper, r"Section\s*I\b[^\n]*", r"Section\s*(Ⅱ|II)")
    m = re.search(r"1\.\s*\[A\]", body)
    if not m:
        raise SystemExit("cloze options not found")
    passage = body[: m.start()]
    passage = re.sub(r"Directions:.*?points\)", "", passage, flags=re.S)
    opt_block = body[m.start():]
    A = re.findall(r"^(\d{1,2})\.\s*\[A\]\s*(.*)$", opt_block, re.M)
    B = re.findall(r"^\[B\]\s*(.*)$", opt_block, re.M)
    C = re.findall(r"^\[C\]\s*(.*)$", opt_block, re.M)
    D = re.findall(r"^\[D\]\s*(.*)$", opt_block, re.M)
    if not (len(A) == len(B) == len(C) == len(D) == 20):
        raise SystemExit(f"cloze option counts {len(A)} {len(B)} {len(C)} {len(D)}")
    items = []
    for i, (num, a) in enumerate(A):
        n = int(num)
        items.append({
            "n": n, "text": f"第{n}空",
            "options": f"A. {a}\nB. {B[i]}\nC. {C[i]}\nD. {D[i]}",
            "answer": key.get(n, ""), "passage": reflow(passage), "kind": "完形",
        })
    return items


def parse_reading(paper, key):
    body = section(paper, r"Part A", r"Part B")
    items = []
    for m in re.finditer(r"Text\s*(\d)\s*\n", body):
        k = int(m.group(1))
        seg = body[m.end():]
        nxt = re.search(r"Text\s*\d\s*\n", seg)
        seg = seg[: nxt.start()] if nxt else seg
        qstart = re.search(r"^(\d{1,2})\.", seg, re.M)
        if not qstart:
            continue
        passage = seg[: qstart.start()].strip()
        qbody = seg[qstart.start():]
        qs = list(re.finditer(r"^(\d{1,2})\.\s*(.*)$", qbody, re.M))
        for i, qm in enumerate(qs):
            n = int(qm.group(1))
            stem = qm.group(2)
            end = qs[i + 1].start() if i + 1 < len(qs) else len(qbody)
            chunk = qbody[qm.end(): end]
            opts = re.findall(r"^\[([A-D])\]\s*(.*)$", chunk, re.M)
            for j, (letter, opt) in enumerate(opts):
                if j + 1 < len(opts):
                    stop = chunk.find(f"[{opts[j+1][0]}]")
                else:
                    stop = len(chunk)
                # keep continuation lines belonging to this option
                _ = stop
            items.append({
                "n": n, "text": stem, "options": "", "answer": key.get(n, ""),
                "passage": reflow(f"Text {k}\n{passage}"), "kind": "阅读", "opts": opts, "chunk": chunk,
            })
    return items


def fix_reading(items):
    for it in items:
        opts = it.pop("opts")
        chunk = it.pop("chunk")
        if len(opts) < 4:
            continue
        start = chunk.find(f"[{opts[0][0]}]")
        pieces = []
        for j, (letter, _) in enumerate(opts):
            a = chunk.find(f"[{letter}]")
            b = chunk.find(f"[{opts[j+1][0]}]") if j + 1 < len(opts) else len(chunk)
            pieces.append(re.sub(r"\s+", " ", chunk[a + 3:b]).strip())
        it["options"] = "\n".join(f"{opts[j][0]}. {pieces[j]}" for j in range(4))


def parse_partb(paper, key):
    body = section(paper, r"Part B", r"Part C")
    opt_start = re.search(r"^\[A\]", body, re.M)
    desc = body[: opt_start.start()] if opt_start else body
    opt_block = body[opt_start.start():] if opt_start else ""
    opts = re.findall(r"^\[([A-G])\]\s*(.*)$", opt_block, re.M)
    # options may wrap: merge continuation lines
    parts = re.split(r"^\[([A-G])\]\s*", opt_block, flags=re.M)
    merged = []
    for i in range(1, len(parts), 2):
        merged.append((parts[i], re.sub(r"\s+", " ", parts[i + 1]).strip()))
    opt_text = "\n".join(f"{l}. {t}" for l, t in merged)
    qs = list(re.finditer(r"^(\d{1,2})\.\s*(.*)$", desc, re.M))
    items = []
    for i, m in enumerate(qs):
        n = int(m.group(1))
        end = qs[i + 1].start() if i + 1 < len(qs) else len(desc)
        stem = re.sub(r"\s+", " ", desc[m.start():end]).strip()
        items.append({"n": n, "text": stem, "options": opt_text, "answer": key.get(n, ""),
                      "passage": reflow(opt_text), "kind": "新题型"})
    return items


def parse_translation(paper, key, trans):
    body = section(paper, r"Part C", r"Section\s*Ⅲ|Section\s*III")
    passage = re.sub(r"Directions:.*?points\)", "", body, flags=re.S)
    items = []
    for m in re.finditer(r"\((\d{2})\)\s*(.*?)(?=\(\d{2}\)|\Z)", passage, re.S):
        n = int(m.group(1))
        sent = re.sub(r"\s+", " ", m.group(2)).strip()
        items.append({"n": n, "text": f"({n}) {sent}", "options": "", "answer": trans.get(n, ""),
                      "passage": reflow(re.sub(r"\(\d{2}\).*", "", passage, flags=re.S)), "kind": "翻译"})
    return items


def parse_writing(paper):
    body = section(paper, r"Section\s*Ⅲ|Section\s*III", r"\Z")
    items = []
    for n, kind, pat in [(51, "小作文", r"Part A"), (52, "大作文", r"Part B")]:
        a = re.search(pat, body)
        seg = body[a.start():] if a else body
        b = re.search(r"Part B", seg[5:]) if n == 51 else None
        seg = seg[: b.start() + 5] if b else seg
        seg = re.sub(r"\s+", " ", seg).strip()
        items.append({"n": n, "text": seg, "options": "", "answer": "参考范文见原解析 PDF",
                      "passage": "", "kind": kind})
    return items


def main():
    paper = text_of(PAPER)
    raw_key = text_of(KEY)
    key = parse_key(raw_key)
    trans = parse_translations(raw_key)
    cloze = parse_cloze(paper, key)
    reading = parse_reading(paper, key)
    fix_reading(reading)
    partb = parse_partb(paper, key)
    tr = parse_translation(paper, key, trans)
    wr = parse_writing(paper)
    allitems = sorted(cloze + reading + partb + tr + wr, key=lambda x: x["n"])
    nums = [x["n"] for x in allitems]
    print("counts", len(allitems), "missing", [i for i in range(1, 53) if i not in nums])
    print("answers", sum(1 for x in allitems if x["answer"]), "empty", [x["n"] for x in allitems if not x["answer"]])
    out = []
    for it in allitems:
        kind = it["kind"]
        text = it["text"] + (("\n" + it["options"]) if it.get("options") else "")
        steps = []
        if kind == "翻译" and it["answer"]:
            steps = [f"参考译文：{it['answer']}"]
        out.append({
            "id": f"eng-{YEAR}-{it['n']}",
            "subject": "english",
            "chapter": f"eng-{YEAR}",
            "chapterTitle": f"英语一 {YEAR} 真题",
            "kp": "",
            "kpName": f"第{it['n']}题（{kind}）",
            "kind": kind,
            "difficulty": "中",
            "year": str(YEAR),
            "source": f"{YEAR} 年全国硕士研究生招生考试 英语（一）",
            "isReal": True,
            "text": text,
            "passage": it.get("passage", ""),
            "answer": it["answer"],
            "steps": steps,
            "sourcePdf": str(PAPER.relative_to(ROOT)).replace("\\", "/"),
            "sourcePage": 0,
            "solutionPdf": str(KEY.relative_to(ROOT)).replace("\\", "/"),
            "solutionPage": 0,
        })
    OUT.write_text(json.dumps({"items": out}, ensure_ascii=False, indent=1), encoding="utf-8")
    print("wrote", OUT)


if __name__ == "__main__":
    main()
