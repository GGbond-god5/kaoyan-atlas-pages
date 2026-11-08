# -*- coding: utf-8 -*-
"""Build imported-eng-2020.json (reading from text layer, cloze/Part B from OCR)."""
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
PAPER = D10 / "2010-2024考研英语真题/2020年考研英语一真题.pdf"
SOL = D10 / "2010-2024考研英语解析/2020年考研英语一真题解析.pdf"

CLOZE = {
    1: ["In", "Towards", "On", "Till"],
    2: ["match", "express", "satisfy", "influence"],
    3: ["patience", "enjoyment", "surprise", "concern"],
    4: ["intensified", "privileged", "compelled", "guaranteed"],
    5: ["issued", "received", "ignored", "cancelled"],
    6: ["under", "at", "for", "by"],
    7: ["forget", "regret", "finish", "avoid"],
    8: ["partially", "regularly", "easily", "initially"],
    9: ["Unless", "Since", "If", "While"],
    10: ["secondary", "external", "conclusive", "negative"],
    11: ["insufficient", "bound", "likely", "slow"],
    12: ["On the basis of", "At the cost of", "In addition to", "In contrast to"],
    13: ["interesting", "advisable", "urgent", "fortunate"],
    14: ["As usual", "In particular", "By definition", "After all"],
    15: ["resemblance", "combination", "connection", "pattern"],
    16: ["made", "served", "saved", "used"],
    17: ["To be fair", "For instance", "To be brief", "In general"],
    18: ["reluctantly", "entirely", "gradually", "carefully"],
    19: ["promise", "experience", "campaign", "competition"],
    20: ["follow up", "pick up", "open up", "end up"],
}

PARTB = {
    "A": "Eye fixations are brief",
    "B": "Too much eye contact is instinctively felt to be rude",
    "C": "Eye contact can be a friendly social signal",
    "D": "Personality can affect how a person reacts to eye contact",
    "E": "Biological factors behind eye contact are being investigated",
    "F": "Most people are not comfortable holding eye contact with strangers",
    "G": "Eye contact can also be aggressive.",
}

KEY = (
    "BADBCCDCCAACDBADCDAB",
    "CBDB CDACADACDCBCABCB".replace(" ", ""),
    "CEGAD",
)


def answer_of(n):
    cloze, reading, partb = KEY
    if n <= 20:
        return cloze[n - 1]
    if n <= 40:
        return reading[n - 21]
    if n <= 45:
        return partb[n - 41]
    return ""


def main():
    paper = pp.page_text(PAPER)
    base = pp.parse(paper)
    items = {}
    for it in base:
        items[it["n"]] = it
    for n in range(1, 21):
        items[n] = {"n": n, "kind": "完形", "text": f"第{n}空",
                    "options": "\n".join(f"{L}. {t}" for L, t in zip("ABCD", CLOZE[n])),
                    "passage": ""}
    opt_text = "\n".join(f"{L}. {t}" for L, t in PARTB.items())
    for n in range(41, 46):
        items[n] = {"n": n, "kind": "新题型", "text": f"第{n}段（选小标题）\n" + opt_text,
                    "options": opt_text, "passage": opt_text}
    # cloze passage from the text layer
    m0 = re.search(r"Directions:.*?points\)", paper, re.S | re.I)
    m1 = re.search(r"(?m)^\s*1\s*[.．]?\s*\[A\]", paper)
    if m1:
        start = m0.end() if m0 else 0
        passage = " ".join(paper[start:m1.start()].split())
        for n in range(1, 21):
            items[n]["passage"] = passage
    # translations: OCR text is cleaner than the text layer's dropped letters
    for it in oi.build(2020, {}, {}):
        if it["kind"] == "翻译":
            n = int(it["id"].rsplit("-", 1)[1])
            if n not in items:
                continue
            if n == 49:
                items[n]["text"] = ("(49) As many took on the duty of trying to integrate reasoning and "
                                    "scientific philosophies into the world, the Renaissance was over and it "
                                    "was time for a new era - the Age of Reason.")
            else:
                items[n]["text"] = it["text"]
    # translation 47 is present in the text layer between (46) and (48)
    m = re.search(r"\(46\).*?\(48\)", paper, re.S)
    if m and 47 not in items:
        seg = m.group(0)
        seg = re.sub(r"^\(46\)", "", seg)
        seg = re.sub(r"\(48\)$", "", seg)
        # drop the 46 sentence: take the text after its final full stop that starts a sentence
        sent = seg.split(".")
        items[47] = {"n": 47, "kind": "翻译", "text": "(47) " + ".".join(sent[1:]).strip(),
                     "options": "", "passage": ""}
    out = []
    for n in sorted(items):
        it = items[n]
        a = answer_of(n)
        if it["kind"] == "翻译":
            steps = ["参考译文见原解析 PDF。"]
        elif it["kind"] in ("小作文", "大作文"):
            steps = ["参考范文见原解析 PDF。"]
        elif a:
            steps = [f"参考答案：{a}"]
        else:
            steps = ["答案见原解析 PDF。"]
        out.append({
            "id": f"eng-2020-{n}", "subject": "english", "chapter": "eng-2020",
            "chapterTitle": "英语一 2020 真题", "kp": "", "kpName": f"第{n}题（{it['kind']}）",
            "kind": it["kind"], "difficulty": "中", "year": "2020",
            "source": "2020 年全国硕士研究生招生考试 英语（一）", "isReal": True,
            "text": it["text"] + (("\n" + it["options"]) if it.get("options") else ""),
            "passage": it.get("passage", ""), "answer": a, "steps": steps,
            "sourcePdf": str(PAPER.relative_to(ROOT)).replace("\\", "/"),
            "solutionPdf": str(SOL.relative_to(ROOT)).replace("\\", "/"),
        })
    path = OUT / "imported-eng-2020.json"
    path.write_text(json.dumps({"items": out}, ensure_ascii=False, indent=1), encoding="utf-8")
    nums = {int(i["id"].rsplit("-", 1)[1]) for i in out}
    print(len(out), "missing", [n for n in range(1, 53) if n not in nums])
    print("no-answer", [i["id"] for i in out if not i["answer"] and i["kind"] in ("完形", "阅读", "新题型")])


if __name__ == "__main__":
    main()
