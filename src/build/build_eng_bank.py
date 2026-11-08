# -*- coding: utf-8 -*-
"""Build imported-eng-<year>.json for English (一) papers 2009-2018.

Questions: paper PDF text layer; a few damaged layouts are patched from the
same text by hand. Answers: published keys (letters), disputed items flagged.
2022/2024 are produced by their own importers.
"""
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "src" / "build"))
import parse_eng_paper as pp  # noqa: E402

OUT = ROOT / "src" / "bank"
D12 = ROOT / "bank/eng-zhenti/02、1998-2009年考研英语真题+解析"
D10 = ROOT / "bank/eng-zhenti/03、2010-2024年考研英语真题+解析"

PAPERS = {2009: D12 / "1998-2009年考研英语真题/2009年考研英语真题.pdf"}
SOLS = {2009: D12 / "1998-2009年考研英语解析/2009年考研英语真题解析.pdf"}
for _y in range(2010, 2025):
    PAPERS[_y] = D10 / f"2010-2024考研英语真题/{_y}年考研英语一真题.pdf"
    SOLS[_y] = D10 / f"2010-2024考研英语解析/{_y}年考研英语一真题解析.pdf"

# (cloze 1-20, reading 21-40, Part B 41-45, disputed questions)
KEYS = {
    2009: ("BADBCADCBDDBCDACBAAC", "CDADAACDABDBBCCBBDAC", "CEABG", []),
    2010: ("ABCBCBDACDCAADBADCB D".replace(" ", ""), "BADABCDCBABDACCADCBD", "BFDGA", [18, 23]),
    2011: ("CDBBABADCABCDCBDADAC", "CBD BABDAACDCBCACDADB".replace(" ", ""), "BDACF", [11, 12, 13, 14, 15]),
    2012: ("BABDCBDBABACCDACACDD", "DBACDCAABBABBDDCDBCA", "CDAFG", []),
    2013: ("ABCDBDAADCACBCBCDDBA", "BDADCBACADBADCBCDAB", "EFBGC", []),
    2014: ("ABDCAACBDCDABADBDCCB", "BCAABDCBACABDAAACABB", "CFGDB", []),
    2015: ("ABDACACBDBBBBCADBACA", "DCABDCAACBBBDCADACBD", "CEGBA", []),
    2016: ("DABACACDDADDBDCBBBCA", "ADBCADADBDBACABADBCC", "CGDEF", [10, 15, 16, 40]),
    2017: ("BCACDABCDBDBDACAABCD", "BCBDABABCDDCDCACACBD", "FEACG", []),
    2018: ("BCBDACABDACADCBDABDC", "DCADBDABCABCDDBBAACD", "EGABD", []),
}

MANUAL = {
    2014: [
        (13, "第13空", ["back", "further", "aside", "around"]),
        (14, "第14空", ["framework", "stability", "flexibility", "sharpness"]),
        (15, "第15空", ["hurries", "reminds", "allows", "forces"]),
        (16, "第16空", ["order", "track", "pace", "hold"]),
        (17, "第17空", ["on", "to", "for", "with"]),
        (18, "第18空", ["habitually", "constantly", "irregularly", "unusually"]),
        (19, "第19空", ["carry", "put", "build", "take"]),
        (20, "第20空", ["idle", "risky", "familiar", "effective"]),
    ],
    2017: [
        (4, "第4空", ["recall", "forget", "avoid", "keep"]),
        (5, "第5空", ["collecting", "involving", "guiding", "affecting"]),
        (7, "第7空", ["devoted", "exposed", "lost", "attracted"]),
        (9, "第9空", ["calculated", "denied", "doubted", "imagined"]),
    ],
    2015: [
        (38, "The author believes that Rebekah Brooks's defence",
         ["was hardly convincing.", "centered on trivial issues.", "revealed a cunning personality.", "was part of a conspiracy."]),
        (39, "The author holds that the current collective doctrine shows",
         ["a marginalized lifestyle.", "unfair wealth distribution.", "generally distorted values.", "a rigid moral code."]),
        (40, "Which of the following is suggested in the last paragraph?",
         ["The quality of writings is of primary importance.", "Moral awareness matters in editing a newspaper.",
          "Common humanity is central to news reporting.", "Journalists need stricter industrial regulations."]),
    ],
}


def load_2022_key():
    import pymupdf
    text = chr(10).join(pg.get_text() for pg in pymupdf.open(str(SOLS[2022])))
    pat = re.compile(r"(?m)^\s*(\d{1,2})\.\s*\[([A-G])\]")
    found = {int(m.group(1)): m.group(2) for m in pat.finditer(text)}
    cloze = "".join(found.get(i, "?") for i in range(1, 21))
    reading = "".join(found.get(i, "?") for i in range(21, 41))
    partb = "".join(found.get(i, "?") for i in range(41, 46))
    return cloze, reading, partb, []


KEYS[2022] = load_2022_key()
MANUAL[2022] = [(9, "第9空", ["analogous", "essential", "suitable", "sensitive"])]


def load_2022_trans():
    import pymupdf
    t = chr(10).join(pg.get_text() for pg in pymupdf.open(str(SOLS[2022])))
    a = t.find("翻译")
    b = t.find("作文", a + 1)
    seg = t[a:b] if a >= 0 else ""
    res = {}
    for m in re.finditer(r"(?m)^\s*(\d{2,2})\.\s*([^\n]+)", seg):
        if m.group(1) in ("46", "47", "48", "49", "50"):
            res.setdefault(m.group(1), m.group(2).strip())
    return res


def answers_of(year, n):
    cloze, reading, partb, disputed = KEYS[year]
    if n <= 20:
        return (cloze[n - 1] if n <= len(cloze) else ""), n in disputed
    if n <= 40:
        i = n - 21
        return (reading[i] if i < len(reading) else ""), n in disputed
    if n <= 45:
        i = n - 41
        return (partb[i] if i < len(partb) else ""), n in disputed
    return "", False


def fill_gaps(items, paper):
    nums = {i["n"] for i in items}
    for n in [x for x in range(21, 41) if x not in nums]:
        prev = max([x for x in nums if x < n], default=21)
        nxt = min([x for x in nums if x > n], default=40)
        m1 = re.search(rf"(?m)^\s*{prev}\s*[.．]", paper)
        m2 = re.search(rf"(?m)^\s*{nxt}\s*[.．]", paper)
        if not m1 or not m2:
            continue
        tail = re.split(r"\n\s*\n", paper[m1.end():m2.start()].strip())[-1]
        opts = re.findall(r"\[([A-D])[J\]】]\s*([^\n\[]*)", tail)
        items.append({"n": n, "kind": "阅读", "text": " ".join(tail.split("[A]")[0].split()),
                      "options": chr(10).join(f"{L}. {t.strip()}" for L, t in opts[:4]),
                      "passage": ""})
        nums.add(n)
    return items


def preprocess(paper, year):
    paper = re.sub(r"(?m)^\s*(\d)\s+(\d)\s*([.．])", r"\1\2\3", paper)
    for a, b in (("[D1", "[D]"), ("[Al", "[A]"), ("[Bl", "[B]"), ("[Cl", "[C]"), ("[Dl", "[D]"),
                 ("[BJ", "[B]"), ("[CJ", "[C]"), ("[DJ", "[D]")):
        paper = paper.replace(a, b)
    if year == 2010:
        paper = paper.replace(chr(10) + "[A] requirements", chr(10) + "5. [A] requirements")
        paper = paper.replace(chr(10) + "[A] as far as", chr(10) + "7. [A] as far as")
        paper = paper.replace(".[A]" + chr(10), ".[A] ")
        paper = paper.replace(".[A] " + chr(10), ".[A] ")
        paper = re.sub(r" (\d{1,2})\.\[A\]", "\n" + r"\1.[A]", paper)
    return paper


def build(year):
    trans = load_2022_trans() if year == 2022 else {}
    paper = preprocess(pp.page_text(PAPERS[year]), year)
    items = pp.parse(paper)
    for n, stem, opts in MANUAL.get(year, []):
        if any(x["n"] == n for x in items):
            continue
        kind = "完形" if n <= 20 else "阅读"
        cloze_pass = next((x["passage"] for x in items if x["kind"] == "完形" and x.get("passage")), "")
        passage = cloze_pass if kind == "完形" else next((x.get("passage", "") for x in items if x["n"] == 36), "")
        items.append({"n": n, "kind": kind, "text": stem,
                      "options": chr(10).join(f"{L}. {t}" for L, t in zip("ABCD", opts)),
                      "passage": passage})
    items = fill_gaps(items, paper)
    items.sort(key=lambda x: x["n"])
    out = []
    for it in items:
        a, disputed = answers_of(year, it["n"])
        if not a and year == 2022 and 46 <= it["n"] <= 50:
            a = trans.get(str(it["n"]), "")
        if it["kind"] == "翻译":
            steps = [f"参考译文：{a}"] if a else ["参考译文见原解析 PDF（题目对应的翻译段落）。"]
        elif it["kind"] in ("小作文", "大作文"):
            steps = ["参考范文见原解析 PDF。"]
        elif disputed:
            steps = [f"参考答案：{a}（各机构版本存在分歧，请以原解析 PDF 为准）"]
        else:
            steps = [f"参考答案：{a}"]
        out.append({
            "id": f"eng-{year}-{it['n']}",
            "subject": "english",
            "chapter": f"eng-{year}",
            "chapterTitle": f"英语一 {year} 真题",
            "kp": "",
            "kpName": f"第{it['n']}题（{it['kind']}）",
            "kind": it["kind"],
            "difficulty": "中",
            "year": str(year),
            "source": f"{year} 年全国硕士研究生招生考试 英语（一）",
            "isReal": True,
            "text": it["text"] + (("\n" + it["options"]) if it.get("options") else ""),
            "passage": it.get("passage", ""),
            "answer": a,
            "steps": steps,
            "sourcePdf": str(PAPERS[year].relative_to(ROOT)).replace("\\", "/"),
            "solutionPdf": str(SOLS[year].relative_to(ROOT)).replace("\\", "/"),
        })
    return out


if __name__ == "__main__":
    years = [int(x) for x in sys.argv[1:]] or sorted(KEYS)
    for y in years:
        out = build(y)
        (OUT / f"imported-eng-{y}.json").write_text(
            json.dumps({"items": out}, ensure_ascii=False, indent=1), encoding="utf-8")
        nums = {int(i["id"].rsplit("-", 1)[1]) for i in out}
        print(y, len(out), "missing", [n for n in range(1, 53) if n not in nums])