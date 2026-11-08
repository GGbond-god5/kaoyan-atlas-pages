# -*- coding: utf-8 -*-
"""Build imported-eng-2025.json from OCR + official answer key."""
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "src" / "build"))
import ocr_eng_import as oi  # noqa: E402
import pymupdf  # noqa: E402

OUT = ROOT / "src" / "bank"
PAPER = ROOT / ("bank/eng-zhenti/2025考研英语真题和答案【完整版】/2025考研英语一真题及答案/"
                "版本二/2025年全国硕士研究生招生考试英语（一）试题-完整版.pdf")
SOL = ROOT / ("bank/eng-zhenti/2025考研英语真题和答案【完整版】/2025考研英语一真题及答案/"
              "版本二/参考答案-完整版.pdf")

CLOZE = {
    1: ["relevant", "prone", "available", "alien"],
    2: ["accidentally", "frequently", "gradually", "temporarily"],
    3: ["disguised", "submerged", "relocated", "isolated"],
    4: ["legends", "programs", "remains", "surroundings"],
    5: ["across", "off", "under", "via"],
    6: ["currents", "rivers", "seasons", "winds"],
    7: ["elevated", "separated", "comprised", "protected"],
    8: ["gathering", "restoring", "updating", "supplying"],
    9: ["when", "until", "after", "once"],
    10: ["belongings", "resources", "products", "structures"],
    11: ["preserve", "select", "display", "examining"],
    12: ["Despite", "Unlike", "Besides", "Among"],
    13: ["unchallenged", "unknown", "unorganized", "undisturbed"],
    14: ["suspended", "transferred", "resumed", "canceled"],
    15: ["policies", "theories", "documents", "techniques"],
    16: ["ordered", "provided", "employed", "adjusted"],
    17: ["effect", "light", "reality", "mind"],
    18: ["crossed", "connected", "blocked", "altered"],
    19: ["expecting", "suggesting", "predicting", "recalling"],
    20: ["robust", "diverse", "marginal", "dependent"],
}


def key_map():
    t = "\n".join(pg.get_text() for pg in pymupdf.open(str(SOL)))
    return {int(m.group(1)): m.group(2) for m in re.finditer(r"(\d{1,2})\.\s*【答案】\s*\[([A-G])\]", t)}


def partb_options():
    t = oi.load(2025)
    a = t.find("Part B")
    b = t.find("Part C")
    body = t[a:b] if b > a else t[a:]
    marks = list(re.finditer(r"(?m)^\[([A-G])\]", body))
    opts = []
    for i, m in enumerate(marks):
        end = marks[i + 1].start() if i + 1 < len(marks) else len(body)
        txt = " ".join(body[m.end():end].split())
        opts.append((m.group(1), txt))
    return "\n".join(f"{L}. {t}" for L, t in opts)


def cloze_passage():
    t = oi.load(2025)
    i = t.find("Located")
    m = re.search(r"(?m)^\s*2\s*[.．·]\s*$", t[i:]) if i >= 0 else None
    if i >= 0 and m:
        return " ".join(t[i:i + m.start()].split())
    return ""


def extra_solutions():
    raw = chr(10).join(pg.get_text() for pg in pymupdf.open(str(SOL)))
    lines = [ln for ln in raw.split(chr(10)) if "参考答案" not in ln and not re.fullmatch(r"\s*\d{1,2}\s*", ln)]
    t = chr(10).join(lines)
    trans = {}
    pat = r"\((4[6-9]|50)\)(.*?)【参考译文】(.*?)(?=\((?:4[6-9]|50)\)|Part\s*[AB]|$)"
    for m in re.finditer(pat, t, re.S):
        trans[int(m.group(1))] = " ".join(m.group(3).split())
    essay = {}
    a = t.rfind("Part A")
    b = t.rfind("Part B")
    if a >= 0 and b > a:
        essay[51] = " ".join(t[a:b].split())[:1500]
    if b >= 0:
        essay[52] = " ".join(t[b:].split())[:1800]
    return trans, essay


def main():
    ans = key_map()
    TRANS, ESSAY = extra_solutions()
    items = oi.build(2025, CLOZE, {})
    passage = cloze_passage()
    for it in items:
        if it["kind"] == "完形":
            it["passage"] = passage
    opt_text = partb_options()
    for it in items:
        n = int(it["id"].rsplit("-", 1)[1])
        if 41 <= n <= 45:
            it["text"] = f"第{n}空（从 A-G 中选段）" + chr(10) + opt_text
            it["options"] = opt_text
            it["passage"] = opt_text
        a = ans.get(n, "")
        it["answer"] = a
        if it["kind"] in ("完形", "阅读", "新题型"):
            it["steps"] = [f"参考答案：{a}"] if a else ["答案见原解析 PDF。"]
        elif it["kind"] == "翻译":
            tr = TRANS.get(n, "")
            it["steps"] = [f"参考译文：{tr}"] if tr else ["参考译文见原解析 PDF。"]
        else:
            es = ESSAY.get(n, "")
            it["steps"] = [f"参考范文：{es}"] if es else ["参考范文见原解析 PDF。"]
        it["sourcePdf"] = str(PAPER.relative_to(ROOT)).replace("\\", "/")
        it["solutionPdf"] = str(SOL.relative_to(ROOT)).replace("\\", "/")
    path = OUT / "imported-eng-2025.json"
    path.write_text(json.dumps({"items": items}, ensure_ascii=False, indent=1), encoding="utf-8")
    nums = {int(i["id"].rsplit("-", 1)[1]) for i in items}
    print(len(items), "missing", [n for n in range(1, 53) if n not in nums])
    print("no-answer", [i["id"] for i in items if not i["answer"] and i["kind"] in ("完形", "阅读", "新题型")])


if __name__ == "__main__":
    main()