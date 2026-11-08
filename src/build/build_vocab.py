# -*- coding: utf-8 -*-
"""Build the vocabulary dataset for the web vocab trainer.

Source: exam-data/NETEMVocabulary (2024 syllabus list), reconciled with the
2027 syllabus' two spelling normalisations (humorous / counterexample).
"""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SRC = ROOT / "src" / "vocab"


def main():
    raw = json.loads((SRC / "netem.json").read_text(encoding="utf-8"))
    rows = next(iter(raw.values()))

    cat_names = []
    cat_index = {}
    for r in rows:
        name = r.get("分类名称") or "其他"
        if name not in cat_index:
            cat_index[name] = len(cat_names)
            cat_names.append(name)

    words = []
    seen = set()
    for r in rows:
        w = (r.get("单词") or "").strip()
        if not w:
            continue
        key = w.lower()
        if key in seen:
            continue
        seen.add(key)
        src = r.get("例句来源") or ""
        is_exam = src.startswith("真题")
        item = {
            "w": w,
            "m": (r.get("释义") or "").strip(),
            "f": r.get("词频") or 0,
            "z": r.get("真题次数") or 0,
            "c": cat_index.get(r.get("分类名称") or "其他", 0),
            "e": r.get("CEFR等级") or "",
            "a": bool(r.get("学术词汇")),
            "v": bool(r.get("高级词汇")),
            "s": round(float(r.get("综合得分") or 0), 1),
        }
        if r.get("其他拼写"):
            item["alt"] = r["其他拼写"]
        if is_exam and r.get("例句"):
            item["ex"] = r["例句"]
            item["exCn"] = r.get("例句翻译") or ""
            item["exSrc"] = src
        words.append(item)

    if "counterexample" not in seen:
        words.append({
            "w": "counterexample",
            "m": "反例",
            "f": 0,
            "z": 0,
            "c": cat_index.get("因果、条件与逻辑关系", 0),
            "e": "C1",
            "a": True,
            "v": True,
            "s": 0,
            "n": "2027 大纲拼写更新：counter-example → counterexample",
        })
        seen.add("counterexample")

    topics = json.loads((SRC / "topics.json").read_text(encoding="utf-8"))["topics"]

    cat_counts = [0] * len(cat_names)
    for item in words:
        cat_counts[item["c"]] += 1

    data = {
        "meta": {
            "total": len({x["w"].lower() for x in words}),
            "entries": len(words),
            "checked": "2027-09",
            "source": "2027 考研英语（一）大纲词汇表（5529 词）",
            "sourceNote": "词表整理自 exam-data/NETEMVocabulary，并按 2027 大纲校对",
            "license": "CC BY-NC-SA 4.0",
            "changes": [
                "humo(u)rous → humorous（拼写规范化）",
                "counter-example → counterexample（拼写规范化）",
                "总量 5529，题型与分值不变",
            ],
        },
        "cats": [{"n": n, "c": cat_counts[i]} for i, n in enumerate(cat_names) if cat_counts[i]],
        "words": words,
        "topics": topics,
    }
    dest = ROOT / "assets" / "vocab-data.js"
    dest.write_text("window.VOCAB=" + json.dumps(data, ensure_ascii=False, separators=(",", ":")) + ";\n",
                    encoding="utf-8")
    print(f"words={len(words)} unique={data['meta']['total']} cats={len(data['cats'])} "
          f"topics={len(topics)} size={dest.stat().st_size/1e6:.2f}MB")


if __name__ == "__main__":
    main()
