# -*- coding: utf-8 -*-
"""Import English (一) papers that only exist as scanned pages.

OCR text comes from src/build/win_ocr_batch.ps1 (300 dpi). Reading questions
are rebuilt from two ordered streams (stem lines, groups of four options), so
OCR damage to question numbers and option letters does not matter.
"""
import glob
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
OCR = ROOT / "_ocr"
OUT = ROOT / "src" / "bank"

HEADER = re.compile(r"全国硕士研究生招生考试|英语\s*[（(]一[)）]\s*试题|共\s*\d+\s*页|^\d{1,2}$")


def load(year):
    files = sorted(glob.glob(str(OCR / str(year) / "*.txt")))
    raw = "\n".join(open(f, encoding="utf-8-sig").read() for f in files)
    out = []
    for ln in raw.split("\n"):
        s = re.sub(r"\s+", " ", ln).strip()
        if not s or HEADER.search(s):
            continue
        out.append(s)
    return "\n".join(out)


def is_opt(s):
    return bool(re.match(r"^[\[\(「]", s)
                or re.match(r"^[A-G]\s*[.．·]\s+[A-Za-z]", s)
                or re.match(r"^[A-G]\s*[\]】\)]", s)
                or re.match(r"^C[A-G]\s*[\]】\)]", s)
                or re.match(r"^[q0]\s+[A-Za-z]", s)
                or re.match(r"^I?A[JI]\s", s))


def clean_opt(s):
    s = re.sub(r"^[\[\(「]\s*[A-G]?\s*[\]J】\)]?\s*", "", s)
    s = re.sub(r"^[A-G]\s*[.．·]\s+", "", s)
    s = re.sub(r"^[A-G]\s*[\]】\)]\s*", "", s)
    s = re.sub(r"^C[A-G]\s*[\]】\)]\s*", "", s)
    s = re.sub(r"^[q0]\s+", "", s)
    s = re.sub(r"^I?A[JI]\s*", "", s)
    return s.strip()


def option_groups(seg):
    groups, cur = [], []
    for ln in seg.split("\n"):
        if is_opt(ln):
            if len(cur) >= 4:
                groups.append(cur)
                cur = []
            cur.append(clean_opt(ln))
        elif cur and len(cur) < 4:
            cur[-1] = (cur[-1] + " " + ln).strip()
    if cur:
        groups.append(cur)
    return groups


def stem_lines(seg, lo, hi):
    out = []
    for ln in seg.split("\n"):
        m = re.match(r"^(\d{1,2})\s*[.．，,·、:：]?\s*([A-Za-z].+)", ln)
        if m and lo <= int(m.group(1)) <= hi:
            out.append(m.group(2).strip())
    return out


def option_groups_pos(seg):
    groups, cur, cur_pos = [], [], 0
    pos = 0
    for ln in seg.split(chr(10)):
        if is_opt(ln):
            if len(cur) >= 4:
                groups.append((cur, cur_pos))
                cur = []
            if not cur:
                cur_pos = pos
            cur.append(clean_opt(ln))
        elif cur and len(cur) < 4:
            cur[-1] = (cur[-1] + " " + ln).strip()
        pos += len(ln) + 1
    if cur:
        groups.append((cur, cur_pos))
    return groups


def parse_reading(text):
    a = text.find("Part A")
    if a < 0:
        return []
    b = text.find("Part B", a)
    if b < 0:
        b = text.find("PartB", a)
    if b < 0:
        b = text.find("Part C", a)
    body = text[a:b] if b > a else text[a:]
    heads = list(re.finditer(r"(?m)^Text\s*([1-4])\b", body))
    bounds = [(h.start(), h.end(), int(h.group(1))) for h in heads]
    if not bounds:
        bounds = [(0, 0, 1)]
    passages = {}
    for idx, (hs, he, k) in enumerate(bounds):
        end = bounds[idx + 1][0] if idx + 1 < len(bounds) else len(body)
        seg = body[he:end]
        ls = seg.split(chr(10))
        cut = len(ls)
        for j, ln in enumerate(ls):
            if is_opt(ln):
                cut = j
                break
        p = " ".join(" ".join(ls[:cut]).split())
        passages[(hs, end)] = (k, p if len(p) >= 80 else "")
    groups = [(g, pos) for g, pos in option_groups_pos(body) if len(g) >= 4]
    stems = stem_lines(body, 21, 40)
    items = []
    for i, (g, pos) in enumerate(groups[:20]):
        n = 21 + i
        stem = stems[i] if i < len(stems) else ""
        k, p = 1, ""
        for (hs, end), (kk, pp) in passages.items():
            if hs <= pos < end:
                k, p = kk, pp
                break
        items.append({"n": n, "kind": "阅读", "text": stem,
                      "options": chr(10).join(f"{L}. {t}" for L, t in zip("ABCD", g[:4])),
                      "passage": f"Text {k}\n{p}" if p else ""})
    return items


def parse_partb(text):
    a = text.find("Part B")
    b = text.find("Part C")
    if a < 0:
        return []
    body = text[a:b] if b > a else text[a:]
    groups = option_groups(body)
    opt_text = ""
    if groups:
        opt_text = "\n".join(f"{L}. {t}" for L, t in zip("ABCDEFG", groups[0][:7]))
    items = []
    for i in range(5):
        items.append({"n": 41 + i, "kind": "新题型", "text": f"第{41 + i}空（从 A-G 中选）",
                      "options": opt_text, "passage": opt_text})
    return items


def parse_translation(text):
    a = text.find("Part C")
    b = text.find("Section III") if "Section III" in text else text.find("Section Ⅲ")
    if a < 0:
        return []
    body = text[a:b if b > a else len(text)]
    items = []
    body = body.replace("@6", "(46)")
    for n in range(46, 51):
        pat = rf"[\(（]\s*{n}\s*[\)）]\s*(.*?)(?=[\(（]\s*(?:4[6-9]|50)\s*[\)）]|$)"
        m = re.search(pat, body, re.S)
        if not m:
            continue
        sent = " ".join(m.group(1).split())
        items.append({"n": n, "kind": "翻译", "text": f"({n}) {sent}", "options": "",
                      "passage": ""})
    return items


def parse_writing(text):
    items = []
    a = text.rfind("Part A")
    b = text.rfind("Part B")
    if a < 0:
        return items
    items.append({"n": 51, "kind": "小作文", "text": " ".join(text[a:b].split()), "options": "",
                  "passage": ""})
    items.append({"n": 52, "kind": "大作文", "text": " ".join(text[b:].split()), "options": "",
                  "passage": ""})
    return items


def build(year, cloze, answers, disputed=()):
    text = load(year)
    items = []
    for n in range(1, 21):
        opts = cloze.get(n)
        if not opts:
            continue
        items.append({"n": n, "kind": "完形", "text": f"第{n}空",
                      "options": "\n".join(f"{L}. {t}" for L, t in zip("ABCD", opts)),
                      "passage": ""})
    items += parse_reading(text)
    items += parse_partb(text)
    items += parse_translation(text)
    items += parse_writing(text)
    items.sort(key=lambda x: x["n"])
    out = []
    for it in items:
        n = it["n"]
        a = answers.get(n, "")
        steps = [f"参考答案：{a}"] if a else ["答案见原解析 PDF。"]
        if n in disputed:
            steps = [f"参考答案：{a}（各机构版本存在分歧，请以原解析 PDF 为准）"]
        if it["kind"] == "翻译":
            steps = ["参考译文见原解析 PDF。"]
        if it["kind"] in ("小作文", "大作文"):
            steps = ["参考范文见原解析 PDF。"]
        out.append({
            "id": f"eng-{year}-{n}",
            "subject": "english",
            "chapter": f"eng-{year}",
            "chapterTitle": f"英语一 {year} 真题",
            "kp": "",
            "kpName": f"第{n}题（{it['kind']}）",
            "kind": it["kind"],
            "difficulty": "中",
            "year": str(year),
            "source": f"{year} 年全国硕士研究生招生考试 英语（一）",
            "isReal": True,
            "text": it["text"] + (("\n" + it["options"]) if it.get("options") else ""),
            "passage": it.get("passage", ""),
            "answer": a,
            "steps": steps,
            "sourcePdf": "",
            "solutionPdf": "",
        })
    return out


if __name__ == "__main__":
    y = int(sys.argv[1])
    out = build(y, {}, {})
    nums = {int(i["id"].rsplit("-", 1)[1]) for i in out}
    print(len(out), "missing", [n for n in range(1, 53) if n not in nums])