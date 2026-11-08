# -*- coding: utf-8 -*-
"""Build imported-eng-2023.json (OCR reading + manual cloze/35-40/Part B)."""
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "src" / "build"))
import ocr_eng_import as oi  # noqa: E402

OUT = ROOT / "src" / "bank"
D10 = ROOT / "bank/eng-zhenti/03、2010-2024年考研英语真题+解析"
PAPER = D10 / "2010-2024考研英语真题/2023年考研英语一真题.pdf"
SOL = D10 / "2010-2024考研英语解析/2023年考研英语一真题解析.pdf"

CLOZE = {
    1: ["displayed", "occupied", "located", "equipped"],
    2: ["privately", "regularly", "respectively", "permanently"],
    3: ["definition", "transition", "substitution", "combination"],
    4: ["classify", "record", "describe", "connect"],
    5: ["apart from", "instead of", "such as", "along with"],
    6: ["construction", "restoration", "impression", "evaluation"],
    7: ["doubted", "faced", "accepted", "reduced"],
    8: ["assigned", "subjected", "accustomed", "opposed"],
    9: ["so that", "even if", "now that", "in case"],
    10: ["talking", "starting", "breaking", "meeting"],
    11: ["By the way", "On occasion", "In comparison", "As a result"],
    12: ["heritage", "revival", "exchange", "status"],
    13: ["with regard to", "in spite of", "as well as", "in line with"],
    14: ["completing", "influencing", "resuming", "pioneering"],
    15: ["aided", "invested", "failed", "competed"],
    16: ["Rather", "Indeed", "Otherwise", "However"],
    17: ["go in for", "stand up for", "close in on", "stock up on"],
    18: ["believed", "predicted", "recalled", "implied"],
    19: ["until", "because", "unless", "although"],
    20: ["ruins", "debt", "fashion", "series"],
}

KEY = ("CADCCABBADDCCBABDADA", "CBACDADBCDACBADBCABD", "BFDCG")

MANUAL = {
    35: ("Which of the following statements best represents Lownie's view?", [
        "Small publishers ought to stick together.",
        "Big publishers will lose their dominance.",
        "The publishing industry is having a hard time.",
        "The merger of publishers is a worrying trend."]),
    36: ("According to Paragraph 1, the careers of scientists can be determined by", [
        "how many citations their works contain",
        "how many times their papers are cited",
        "the prestige of the people they work with",
        "the status they have in scientific circles"]),
    37: ("The support service consultancies tend to", [
        "recommend journals to their clients",
        "list citation patterns their clients",
        "ask authors to include extra citations",
        "advise contributors to cite each other"]),
    38: ('The function of the "milk cow" journals is to', [
        "boost citation counts for certain authors",
        "help scholars publish articles at low cost",
        "instruct first-time contributors in citation",
        "increase the readership of new journals"]),
    39: ("What can be learned about Scopus from the last two paragraphs?", [
        "It fosters competition among citation providers.",
        "It has the capability to identify suspicious citations.",
        'It hinders the growth of "international" journals.',
        "It is established to prevent citation manipulation."]),
    40: ("What should an author do to deal with citation manipulators?", [
        "Take legal action.", "Demand an apology.", "Seek professional advice.", "Reveal their misconduct."]),
}


def answer_of(n):
    c, r, b = KEY
    if n <= 20:
        return c[n - 1]
    if n <= 40:
        return r[n - 21]
    if n <= 45:
        return b[n - 41]
    return ""


def partb_options(raw):
    a = raw.find("Part B")
    b = raw.find("Part C", a)
    body = raw[a:b] if a >= 0 and b > a else ""
    marks = list(re.finditer(r"(?m)^([A-H])(?:[.．·]|[øO0](?=\s))?\s+", body))
    opts = []
    for i, m in enumerate(marks):
        end = marks[i + 1].start() if i + 1 < len(marks) else len(body)
        opts.append((m.group(1), " ".join(body[m.end():end].split())))
    return "\n".join(f"{L}. {t}" for L, t in opts)


def cloze_passage(raw):
    i = raw.lower().find("use of english")
    m = re.search(r"(?m)^\s*1\s*[.．]?\s*[A-D][.．]\s", raw[i:] if i >= 0 else raw)
    if i < 0 or not m:
        return ""
    body = raw[i:i + m.start()]
    k = body.find("points")
    if k > 0:
        e1 = body.find("）", k)
        e2 = body.find(")", k)
        cand = [x for x in (e1, e2) if x > 0]
        if cand:
            body = body[min(cand) + 1:]
    return " ".join(body.split())


def main():
    raw = oi.load(2023)
    passage = cloze_passage(raw)
    items = {}
    for n in range(1, 21):
        items[n] = {"n": n, "kind": "完形", "text": f"第{n}空",
                    "options": "\n".join(f"{L}. {t}" for L, t in zip("ABCD", CLOZE[n])),
                    "passage": passage}
    for it in oi.build(2023, {}, {}):
        n = int(it["id"].rsplit("-", 1)[1])
        if n >= 21:
            items[n] = it
    for n, (stem, opts) in MANUAL.items():
        items[n] = {"n": n, "kind": "阅读", "text": stem,
                    "options": "\n".join(f"{L}. {t}" for L, t in zip("ABCD", opts)),
                    "passage": ""}
    opt_text = partb_options(raw)
    for n in range(41, 46):
        items[n] = {"n": n, "kind": "新题型", "text": f"第{n}空（从 A-G 中选段）",
                    "options": opt_text, "passage": opt_text}
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
            "id": f"eng-2023-{n}", "subject": "english", "chapter": "eng-2023",
            "chapterTitle": "英语一 2023 真题", "kp": "", "kpName": f"第{n}题（{it['kind']}）",
            "kind": it["kind"], "difficulty": "中", "year": "2023",
            "source": "2023 年全国硕士研究生招生考试 英语（一）", "isReal": True,
            "text": it["text"] + (("\n" + it["options"]) if it.get("options") else ""),
            "passage": it.get("passage", ""), "answer": a, "steps": steps,
            "sourcePdf": str(PAPER.relative_to(ROOT)).replace("\\", "/"),
            "solutionPdf": str(SOL.relative_to(ROOT)).replace("\\", "/"),
        })
    path = OUT / "imported-eng-2023.json"
    path.write_text(json.dumps({"items": out}, ensure_ascii=False, indent=1), encoding="utf-8")
    nums = {int(i["id"].rsplit("-", 1)[1]) for i in out}
    print(len(out), "missing", [n for n in range(1, 53) if n not in nums])


if __name__ == "__main__":
    main()