# -*- coding: utf-8 -*-
"""Assemble OCR-imported English papers (2021 first) with keys and patches."""
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "src" / "build"))
import ocr_eng_import as oi  # noqa: E402

OUT = ROOT / "src" / "bank"
D10 = ROOT / "bank/eng-zhenti/03、2010-2024年考研英语真题+解析"

CLOZE_2021 = {
    1: ["pauses", "returns", "peaks", "fades"],
    2: ["alternatively", "formally", "accidentally", "generally"],
    3: ["while", "since", "once", "until"],
    4: ["detection", "accumulation", "consumption", "separation"],
    5: ["possibility", "decision", "goal", "requirement"],
    6: ["delay", "ensure", "seek", "utilize"],
    7: ["modified", "supported", "included", "predicted"],
    8: ["devoted", "compared", "converted", "applied"],
    9: ["with", "above", "by", "against"],
    10: ["lived", "managed", "scored", "played"],
    11: ["ran out", "set off", "drew in", "went by"],
    12: ["superior", "attributable", "parallel", "resistant"],
    13: ["restored", "isolated", "involved", "controlled"],
    14: ["alter", "spread", "remove", "explain"],
    15: ["compensations", "symptoms", "demands", "treatments"],
    16: ["Likewise", "Meanwhile", "Therefore", "Instead"],
    17: ["change", "watch", "count", "take"],
    18: ["well-being", "process", "formation", "coordination"],
    19: ["level", "love", "knowledge", "space"],
    20: ["design", "routine", "diet", "prescription"],
}

KEY_2021 = (
    "ACDCDBCBADC BACBDAADB".replace(" ", ""),
    "ACDDB CBCDA BAABCD ADBC".replace(" ", ""),
    "FCADG",
)

MANUAL_2021 = {
    35: ("Which of the following questions does the text answer?", [
        "Why did most Victorians look stern in photographs?",
        "Why did the Victorians start to view photographs?",
        "What made photography develop in the Victorian period?",
        "How did smiling in photographs become a post-Victorian norm?",
    ]),
}


PARTB_2021 = {
    "A": "AI replaces the boring parts of your job. If you're doing research, you can have AI go out and look for relevant sources and information that otherwise you just wouldn't have time for.",
    "B": "One accounting firm, EY, uses an AI system that helps review contracts during an audit. This process, along with employees reviewing the contracts, is faster and more accurate.",
    "C": "There are also companies like Acquisi0, which analyzes advertising performance across multiple channels like Adwords, Bing and social media and makes adjustments or suggestions about where advertising funds will yield best results.",
    "D": "You want to predict if something needs attention now and point to where it's useful for employees to go to.",
    "E": "Before, they might not insure the ones who felt like a high risk or charge them too much, or they would charge them too little and then it would cost the company money.",
    "F": "We're also giving our customers better channels versus picking up the phone to accomplish something beyond human scale.",
    "G": "AI looks at resumes in greater numbers than humans would be able to, and selects the more promising candidates.",
}

PAPER_2021 = D10 / "2010-2024考研英语真题/2021年考研英语一真题.pdf"
SOL_2021 = D10 / "2010-2024考研英语解析/2021年考研英语一真题解析.pdf"


def answers(n):
    cloze, reading, partb = KEY_2021
    if n <= 20:
        return cloze[n - 1] if n <= len(cloze) else ""
    if n <= 40:
        i = n - 21
        return reading[i] if i < len(reading) else ""
    if n <= 45:
        i = n - 41
        return partb[i] if i < len(partb) else ""
    return ""


def cloze_passage():
    import re
    t = oi.load(2021)
    m = re.search(r"(?m)^\s*1\s*[.．]?\s*\[A\]", t)
    if not m:
        return ""
    k = t.rfind("points", 0, m.start())
    a = t.find(chr(10), k) if k >= 0 else 0
    body = t[a if a > 0 else 0:m.start()]
    body = re.sub(r"Directions[:：].*?points\)", "", body, flags=re.S | re.I)
    return " ".join(body.split())


def build_2021():
    items = oi.build(2021, CLOZE_2021, {})
    passage = cloze_passage()
    for it in items:
        if it["kind"] == "完形":
            it["passage"] = passage
    # replace a damaged group with the hand-checked one
    for n, (stem, opts) in MANUAL_2021.items():
        items = [i for i in items if not i["id"].endswith(f"-{n}")]
        items.append({
            "id": f"eng-2021-{n}", "subject": "english", "chapter": "eng-2021",
            "chapterTitle": "英语一 2021 真题", "kp": "", "kpName": f"第{n}题（阅读）",
            "kind": "阅读", "difficulty": "中", "year": "2021",
            "source": "2021 年全国硕士研究生招生考试 英语（一）", "isReal": True,
            "text": stem + "\n" + "\n".join(f"{L}. {t}" for L, t in zip("ABCD", opts)),
            "passage": "Text 3", "answer": "", "steps": [], "sourcePdf": "", "solutionPdf": "",
        })
    items.sort(key=lambda x: int(x["id"].rsplit("-", 1)[1]))
    opt_text = chr(10).join(f"{L}. {t}" for L, t in PARTB_2021.items())
    for it in items:
        n = int(it["id"].rsplit("-", 1)[1])
        if 41 <= n <= 45:
            it["text"] = f"第{n}空（从 A-G 中选）" + chr(10) + opt_text
            it["passage"] = opt_text
    for it in items:
        n = int(it["id"].rsplit("-", 1)[1])
        a = answers(n)
        it["answer"] = a
        if it["kind"] in ("完形", "阅读", "新题型"):
            note = "；各机构对 2021 年答案存在分歧" if 1 <= n <= 45 else ""
            it["steps"] = [f"参考答案：{a}（公开答案，多源不一致，请对照原解析）"] if n <= 45 else [f"参考答案：{a}"]
        elif it["kind"] == "翻译":
            it["steps"] = ["参考译文见原解析 PDF。"]
        elif it["kind"] in ("小作文", "大作文"):
            it["steps"] = ["参考范文见原解析 PDF。"]
        it["sourcePdf"] = str(PAPER_2021.relative_to(ROOT)).replace("\\", "/")
        it["solutionPdf"] = str(SOL_2021.relative_to(ROOT)).replace("\\", "/")
    return items


if __name__ == "__main__":
    out = build_2021()
    path = OUT / "imported-eng-2021.json"
    path.write_text(json.dumps({"items": out}, ensure_ascii=False, indent=1), encoding="utf-8")
    nums = {int(i["id"].rsplit("-", 1)[1]) for i in out}
    print(len(out), "missing", [n for n in range(1, 53) if n not in nums])
    print("no-answer", [i["id"] for i in out if not i["answer"] and i["kind"] in ("完形", "阅读", "新题型")])