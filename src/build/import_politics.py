# -*- coding: utf-8 -*-
"""Parse 2017-2026 politics papers (choice questions only) into imported-pol-*.json.

Sources:
  1. classified question/analysis books (max coverage, tags carry year + original qno)
  2. paper-mode analysis book (authoritative answers for the questions it covers)
"""
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
DIR = ROOT / "bank" / "pol-zhenti"
QCLASS = DIR / "考研政治10年真题分类（2017-2026）试题册.pdf"
ACLASS = DIR / "考研政治10年真题分类（2017-2026）解析册.pdf"
PAPER = DIR / "考研政治10年真题套卷选择题去时政版（2017-2026）.pdf"
PSOL = DIR / "考研政治10年真题套卷选择题去时政版解析册（2017-2026）.pdf"
OUT = ROOT / "src" / "bank"

TAG = re.compile(r"【\s*(\d{4})\s*年真题\s*第\s*(\d{1,2})\s*题\s*】")
CLS_START = re.compile(r"^\s*(?:\d{1,2}\.\s*[^\n【]{0,100})?【\s*(\d{4})\s*年真题\s*第\s*(\d{1,2})\s*题\s*】")
YEAR_HEAD = re.compile(r"^(\d{4})\s*年全国硕士研究生招生考试思想政治理论试卷")
QSTART = re.compile(r"^(\d{1,2})\.\s*(?!\d)")
OPT = re.compile(r"^([A-D])[.．、]\s*(.*)$")
SECTION = re.compile(r"^(第[一二三四五六七八九十]+[部分章]|[一二三四五六七八九十]+、|单选题|多选题|导论)")
HEADERS = (
    re.compile(r"^(考研政治十年真题分类(解析册)?（2017-2026）|考研政治10\s*年真题套卷选择题去时政版(解析册)?（2017-2026）|摩西学长|微信公众号[:：]|抖音/)"),
)


def pages_of(path):
    import pymupdf
    doc = pymupdf.open(str(path))
    for i, pg in enumerate(doc):
        yield i + 1, pg.get_text()


def clean(text):
    out = []
    for ln in text.split("\n"):
        s = ln.strip()
        if not s or any(h.match(s) for h in HEADERS) or re.fullmatch(r"\d{1,3}", s):
            continue
        out.append(s)
    return out


def join_tags(lines):
    out, i = [], 0
    while i < len(lines):
        s = lines[i]
        looks_split = (
            "【" in s and "】" not in s and (
                "真题" in s
                or (i + 1 < len(lines) and re.match(r"^[^【】]{0,12}(年真题|真题\s*第|第\s*\d+\s*题)", lines[i + 1]))
            )
        )
        if looks_split:
            j, merged = i, s
            while j + 1 < len(lines) and "】" not in merged and j - i < 3:
                j += 1
                merged += lines[j]
            if "】" in merged and TAG.search(merged):
                i = j
                s = merged
        out.append(s)
        i += 1
    return out


def parse_stem(lines):
    stem, opts = [], {}
    for s in lines:
        m = OPT.match(s)
        if m:
            opts[m.group(1)] = m.group(2)
        elif opts and not SECTION.match(s) and not s.startswith("【") and s not in ("A", "B", "C", "D"):
            opts[max(opts)] += s
        elif not opts and not SECTION.match(s):
            stem.append(s)
    return "".join(stem), opts


def parse_classified_questions():
    qs = {}
    for pno, text in pages_of(QCLASS):
        cur = None
        for s in join_tags(clean(text)):
            m = CLS_START.match(s)
            if m:
                cur = {"year": int(m.group(1)), "qno": int(m.group(2)), "lines": [], "page": pno}
                qs[(cur["year"], cur["qno"])] = cur
            elif cur is not None:
                cur["lines"].append(s)
    for q in qs.values():
        q["stem"], q["opts"] = parse_stem(q["lines"])
    return qs


def parse_classified_answers():
    chunks = [(pno, "\n".join(join_tags(clean(text)))) for pno, text in pages_of(ACLASS)]
    full = "\n\n".join(c for _, c in chunks)
    bounds, off = [], 0
    for pno, c in chunks:
        bounds.append((off, off + len(c), pno))
        off += len(c) + 2

    def page_at(pos):
        for a, b, p in bounds:
            if a <= pos <= b:
                return p
        return 0

    pat = re.compile(r"(?P<tag>" + TAG.pattern + r")"
                     r"|(?P<ans>【答案】\s*([A-D]+))"
                     r"|(?P<type>【题目类型】\s*([^\n【]*))"
                     r"|(?P<exp>【解析】)")
    res, cur, exp_start = {}, None, None
    for m in pat.finditer(full):
        if m.group("tag"):
            if cur and exp_start is not None:
                cur["analysis"] = re.sub(r"\s+", "", full[exp_start:m.start()])
            key = (int(m.group(2)), int(m.group(3)))
            if key not in res:
                res[key] = {"answer": "", "qtype": "", "analysis": "", "page": page_at(m.start())}
            cur = res[key]
            exp_start = None
        elif cur is None:
            continue
        elif m.group("ans"):
            if not cur["answer"]:
                cur["answer"] = re.sub(r"[^A-D]", "", m.group(5))
        elif m.group("type") is not None:
            cur["qtype"] = m.group(7).strip()
        elif m.group("exp"):
            exp_start = m.end()
    if cur and exp_start is not None:
        cur["analysis"] = re.sub(r"\s+", "", full[exp_start:])
    return res


def parse_paper_solution():
    items, year, cur = {}, None, None
    for pno, text in pages_of(PSOL):
        for s in clean(text):
            m = YEAR_HEAD.match(s)
            if m:
                year = int(m.group(1))
                continue
            m = QSTART.match(s)
            if m and year:
                cur = {"year": year, "qno": int(m.group(1)), "answer": "", "qtype": "",
                       "analysis": [], "stem": [], "opts": {}, "mode": "stem"}
                items[(year, cur["qno"])] = cur
                continue
            if not cur:
                continue
            if s.startswith("【答案】"):
                cur["answer"] = re.sub(r"[^A-D]", "", s.split("】", 1)[1])
                cur["mode"] = "answer"
            elif s.startswith("【题目类型】"):
                cur["qtype"] = s.split("】", 1)[1].strip()
            elif s.startswith("【解析】"):
                cur["analysis"].append(s.split("】", 1)[1])
                cur["mode"] = "analysis"
            elif cur["mode"] == "analysis":
                cur["analysis"].append(s)
            elif cur["mode"] in ("stem", "opts", "answer"):
                mo = OPT.match(s)
                if mo:
                    cur["opts"][mo.group(1)] = mo.group(2)
                    cur["mode"] = "opts"
                elif cur["mode"] == "opts" and s not in ("A", "B", "C", "D"):
                    cur["opts"][max(cur["opts"])] += s
                elif cur["mode"] == "stem":
                    cur["stem"].append(s)
    for v in items.values():
        v["analysis"] = "".join(v["analysis"])
        v["stem"] = "".join(v["stem"])
    return items


def parse_paper_pages():
    pages, year = {}, None
    for pno, text in pages_of(PAPER):
        for s in clean(text):
            m = YEAR_HEAD.match(s)
            if m:
                year = int(m.group(1))
                continue
            m = QSTART.match(s)
            if m and year:
                pages[(year, int(m.group(1)))] = pno
    return pages


# Manually verified answers for questions the paper-mode book reflows/loses.
OVERRIDES = {}


def answer_from_analysis(analysis, fallback=""):
    """The printed 【答案】 line can be split by page reflow; the prose conclusion is safer."""
    text = analysis or ""
    hits = re.findall(r"正确答案为\s*([A-D]{1,4})", text)
    if hits:
        return hits[-1]
    hits = re.findall(r"故选\s*([A-D]{1,4})", text)
    if hits:
        return hits[-1]
    if "全选" in text:
        return "ABCD"
    return fallback


def clean_analysis(t):
    t = re.sub(r"\s+", "", t or "")
    m = re.search(r"正确答案为[A-D]{1,4}。", t)
    if m:
        t = t[:m.end()]
    t = re.sub(r"\d{1,2}\.（考点.*$", "", t)
    return t


def steps_of(analysis, qtype):
    text = (analysis or "").strip()
    if not text:
        return []
    sents = [x for x in re.split(r"(?<=。)", text) if x.strip()]
    steps, cur = [], ""
    for s in sents:
        if len(cur) + len(s) <= 160:
            cur += s
        else:
            steps.append(cur.strip())
            cur = s
    if cur:
        steps.append(cur.strip())
    if qtype:
        steps.insert(0, f"题型：{qtype}")
    if len(steps) > 8:
        steps = steps[:7] + ["".join(steps[7:])]
    return steps


def main():
    qs = parse_classified_questions()
    ac = parse_classified_answers()
    ps = parse_paper_solution()
    pages = parse_paper_pages()
    print("classified q", len(qs), "classified ans", len(ac), "paper ans", len(ps), "paper pages", len(pages))
    by_year, incomplete = {}, []
    for key, q in qs.items():
        p1 = ps.get(key, {})
        p2 = ac.get(key, {})
        ans = p1 if p1.get("answer") else p2
        ov = OVERRIDES.get(key, {})
        raw_analysis = p1.get("analysis") or p2.get("analysis", "")
        answer = answer_from_analysis(raw_analysis, ans.get("answer", ""))
        answer = ov.get("answer") or answer
        analysis = ov.get("analysis") or clean_analysis(raw_analysis)
        if answer and not analysis:
            analysis = "（本题解析册未给出完整解析，答案依据原卷答案速查。）"
        if not answer or len(q["opts"]) < 4 or not q["stem"]:
            incomplete.append((key, bool(answer), len(q["opts"])))
        year, qno = key
        kind = "单选题" if qno <= 16 else "多选题"
        pq = ps.get(key, {})
        stem = pq.get("stem") or q["stem"]
        opts_d = pq["opts"] if len(pq.get("opts", {})) >= 4 else q["opts"]
        stem = re.sub(r"（考点[^）]*）\s*$", "", stem)
        opts_d = {k: re.sub(r"（考点[^）]*）\s*$", "", v) for k, v in opts_d.items()}
        opts = "\n".join(f"{k}. {opts_d[k]}" for k in "ABCD" if k in opts_d)
        if key in pages:
            page, src_pdf, img = pages[key], PAPER, f"content/pol-pages/{year}-p{pages[key]}.jpg"
        else:
            page, src_pdf, img = q["page"], QCLASS, f"content/pol-pages/{year}-cls-p{q['page']}.jpg"
        item = {
            "id": f"pol-{year}-{qno}",
            "subject": "politics",
            "chapter": f"pol-{year}",
            "chapterTitle": f"政治 {year} 真题",
            "kp": "",
            "kpName": f"第{qno}题（{kind}）",
            "kind": kind,
            "difficulty": "中",
            "year": str(year),
            "source": f"{year} 年全国硕士研究生招生考试 思想政治理论",
            "isReal": True,
            "text": stem + "\n" + opts,
            "answer": answer,
            "steps": steps_of(analysis, ans.get("qtype", "")),
            "pageImage": img,
            "sourcePdf": str(src_pdf.relative_to(ROOT)).replace("\\", "/"),
            "sourcePage": page,
            "solutionPdf": str(ACLASS.relative_to(ROOT)).replace("\\", "/"),
            "solutionPage": p2.get("page", 0),
        }
        by_year.setdefault(year, []).append(item)
    print("incomplete", incomplete)
    for year, items in sorted(by_year.items()):
        items.sort(key=lambda x: int(x["id"].rsplit("-", 1)[1]))
        path = OUT / f"imported-pol-{year}.json"
        path.write_text(json.dumps({"items": items}, ensure_ascii=False, indent=1), encoding="utf-8")
        print(year, len(items), "->", path.name)


if __name__ == "__main__":
    main()
