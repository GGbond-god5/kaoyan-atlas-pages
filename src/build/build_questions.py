# -*- coding: utf-8 -*-
"""Export every chapter exam item into the in-browser practice bank."""
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SUBJECTS = ["math", "english", "mechanics", "politics"]
SUBJECT_CN = {"math": "数学一", "english": "英语一", "mechanics": "807 材料力学", "politics": "政治"}


def kind_of(subject, ch, text):
    if subject == "english":
        title = ch["title"]
        for k in ["阅读", "完形", "新题型", "翻译", "小作文", "大作文", "词汇", "句式"]:
            if k in title:
                return k
        return "英语"
    if subject == "politics":
        if "（）" in text or "（ ）" in text or "选项" in text:
            return "选择题"
        if "分析" in text or "说明" in text or "为什么" in text:
            return "分析题"
        return "概念题"
    if "证明" in text:
        return "证明题"
    if subject == "mechanics":
        return "计算题" if re.search(r"[0-9０-９]|求|已知", text) else "简答题"
    return "计算题"


def main():
    items = []
    for sid in SUBJECTS:
        for f in sorted((ROOT / "src" / "chapters" / sid).glob("*.json")):
            if f.stem == "00":
                continue
            ch = json.loads(f.read_text(encoding="utf-8"))
            for kp in ch.get("kps", []):
                for idx, e in enumerate(kp.get("exams", []), 1):
                    text = (e.get("text") or "").strip()
                    if not text:
                        continue
                    year = e.get("year") or ""
                    level = kp.get("level", "")
                    difficulty = "易" if level in ("基础", "了解") else ("难" if level == "进阶" else "中")
                    items.append({
                        "id": f"{ch['id']}-{kp.get('id', 'kp')}-{idx}",
                        "subject": sid,
                        "subjectName": SUBJECT_CN[sid],
                        "chapter": ch["id"],
                        "chapterTitle": ch["title"],
                        "kp": kp.get("id", ""),
                        "kpName": kp.get("name", ""),
                        "kind": kind_of(sid, ch, text),
                        "difficulty": difficulty,
                        "year": year,
                        "source": e.get("source") or "",
                        "isReal": bool(year),
                        "text": text,
                        "answer": e.get("answer") or "",
                        "steps": e.get("steps") or [],
                        "figures": [x.get("src") for x in (e.get("figures") or []) if isinstance(x, dict) and x.get("src")],
                    })
    # merge questions transcribed from downloaded papers
    seen = {i["id"] for i in items}
    for f in sorted((ROOT / "src" / "bank").glob("imported-*.json")):
        try:
            extra = json.loads(f.read_text(encoding="utf-8")).get("items", [])
        except Exception as e:
            print("skip", f.name, e)
            continue
        names = {"math": "数学一", "math2": "数学二", "english": "英语一", "english2": "英语二", "mechanics": "807 材料力学", "politics": "政治"}
        for it in extra:
            if it.get("id") and it["id"] not in seen:
                it.setdefault("subjectName", names.get(it.get("subject"), ""))
                it.setdefault("difficulty", "中")
                it["figures"] = [x.get("src") if isinstance(x, dict) else x
                                 for x in (it.get("figures") or []) if x]
                it["figures"] = [x for x in it["figures"] if x]
                items.append(it)
                seen.add(it["id"])
        print("merged", f.name, len(extra))

    data = {
        "meta": {"total": len(items), "built": "2026-11-08",
                 "note": "题目来自大观各章：标年份的为原卷原题，其余为同考点改编（同型）。"},
        "items": items,
    }
    dest = ROOT / "assets" / "questions.js"
    dest.write_text("window.QUESTIONS=" + json.dumps(data, ensure_ascii=False, separators=(",", ":")) + ";\n",
                    encoding="utf-8")
    from collections import Counter
    print("total", len(items), Counter(i["subject"] for i in items))
    print("kinds", Counter(i["kind"] for i in items).most_common(12))
    print("size", round(dest.stat().st_size / 1e6, 2), "MB")


if __name__ == "__main__":
    main()
