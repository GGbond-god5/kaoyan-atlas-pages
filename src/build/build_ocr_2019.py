# -*- coding: utf-8 -*-
"""Build imported-eng-2019.json (reading via OCR, cloze/Part B via text layer)."""
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "src" / "build"))
import parse_eng_paper as pp  # noqa: E402
import ocr_eng_import as oi  # noqa: E402

OUT = ROOT / "src" / "bank"
D10 = ROOT / "bank/eng-zhenti/03、2010-2024年考研英语真题+解析"
PAPER = D10 / "2010-2024考研英语真题/2019年考研英语一真题.pdf"
SOL = D10 / "2010-2024考研英语解析/2019年考研英语一真题解析.pdf"

KEY = ("CCBDABDCADABDCBDAABC", "ADBCBDAACBCDBACCDCBA", "EDGBA")


def answer_of(n):
    c, r, b = KEY
    if n <= 20:
        return c[n - 1]
    if n <= 40:
        return r[n - 21]
    if n <= 45:
        return b[n - 41]
    return ""


def partb_options(text):
    a = text.find("PartB")
    if a < 0:
        a = text.find("Part B")
    b = text.find("PartC", a)
    if b < 0:
        b = text.find("Part C", a)
    body = text[a:b] if a >= 0 and b > a else ""
    marks = list(re.finditer(r"\[\s*([A-G])\s*\]", body))
    opts = []
    for i, m in enumerate(marks):
        end = marks[i + 1].start() if i + 1 < len(marks) else len(body)
        opts.append((m.group(1), " ".join(body[m.end():end].split())))
    return "\n".join(f"{L}. {t}" for L, t in opts)


MANUAL = {
    36: ("The Supreme Court decision Thursday will", [
        "better businesses' relations with states.",
        "put most online businesses in a dilemma.",
        "make more online shoppers pay sales tax.",
        "force some states to cut sales tax."]),
    37: ("It can be learned from paragraphs 2 and 3 that the overruled decisions", [
        "have led to the dominance of e-commerce.",
        "have cost consumers a lot over the years.",
        "were widely criticized by online purchasers.",
        "were considered unfavorable by states."]),
    38: ("According to Justice Anthony Kennedy, the physical presence rule has", [
        "hindered economic development.",
        "brought prosperity to the country.",
        "harmed fair market competition.",
        "boosted growth in states' revenue."]),
    39: ("Who are most likely to welcome the Supreme Court ruling?", [
        "Internet entrepreneurs.", "Big-chain owners.", "Third-party sellers.", "Small retailers."]),
    40: ("In dealing with the Supreme Court decision Thursday, the author", [
        "gives a factual account of it and discusses its consequences.",
        "describes the long and complicated process of its making.",
        "cites some cases related to it and analyzes their implications.",
        "presents its reasons for the decision and criticizes it."]),
}


def main():
    text = pp.page_text(PAPER)
    items = {}
    for it in pp.parse(text):
        if it["n"] <= 20:
            items[it["n"]] = it
    for it in oi.build(2019, {}, {}):
        n = int(it["id"].rsplit("-", 1)[1])
        if n >= 21:
            items[n] = it
    opt_text = partb_options(text)
    if opt_text.count(chr(10)) < 6:
        opt_text = ""
    for n in range(41, 46):
        items[n] = {"n": n, "kind": "新题型", "text": f"第{n}空（从 A-G 中选段，选项见原卷 PDF）",
                    "options": opt_text, "passage": opt_text}
    for n, (stem, opts) in MANUAL.items():
        items[n] = {"n": n, "kind": "阅读", "text": stem,
                    "options": chr(10).join(f"{L}. {t}" for L, t in zip("ABCD", opts)),
                    "passage": ""}
    for n in MANUAL:
        if not items[n].get("passage"):
            for k in (n - 1, n - 2, n + 1):
                if k in items and items[k].get("passage"):
                    items[n]["passage"] = items[k]["passage"]
                    break
    out = []
    for n in sorted(items):
        it = items[n]
        a = answer_of(n)
        if it["kind"] == "翻译":
            steps = ["参考译文见原解析 PDF。"]
        elif it["kind"] in ("小作文", "大作文"):
            steps = ["参考范文见原解析 PDF。"]
        else:
            steps = [f"参考答案：{a}"] if a else ["答案见原解析 PDF。"]
        out.append({
            "id": f"eng-2019-{n}", "subject": "english", "chapter": "eng-2019",
            "chapterTitle": "英语一 2019 真题", "kp": "", "kpName": f"第{n}题（{it['kind']}）",
            "kind": it["kind"], "difficulty": "中", "year": "2019",
            "source": "2019 年全国硕士研究生招生考试 英语（一）", "isReal": True,
            "text": it["text"] + (("\n" + it["options"]) if it.get("options") else ""),
            "passage": it.get("passage", ""), "answer": a, "steps": steps,
            "sourcePdf": str(PAPER.relative_to(ROOT)).replace("\\", "/"),
            "solutionPdf": str(SOL.relative_to(ROOT)).replace("\\", "/"),
        })
    path = OUT / "imported-eng-2019.json"
    path.write_text(json.dumps({"items": out}, ensure_ascii=False, indent=1), encoding="utf-8")
    nums = {int(i["id"].rsplit("-", 1)[1]) for i in out}
    print(len(out), "missing", [n for n in range(1, 53) if n not in nums])


if __name__ == "__main__":
    main()