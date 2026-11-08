# -*- coding: utf-8 -*-
"""Collect chapter JSON + built page map into assets/data.js for the atlas index."""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SUBJECTS = [
    ("math", "数学一", "MATHEMATICS I", "#1F3A5F", "#E7ECF3"),
    ("english", "英语一", "ENGLISH I", "#5B3A6B", "#EEE8F2"),
    ("mechanics", "807 材料力学", "MECHANICS OF MATERIALS", "#8A4B2A", "#F2E9E1"),
    ("politics", "政治", "POLITICS", "#A02C2C", "#F5E6E3"),
]
totals = {"chapters": 0, "kps": 0, "exams": 0, "topics": 0, "pages": 0}


def load(p):
    try:
        return json.loads(p.read_text(encoding="utf-8"))
    except Exception as e:
        print(f"  ! skip {p.name}: {e}")
        return None


def main():
    pages_file = ROOT / "src" / "build" / "pages.json"
    pages = load(pages_file) if pages_file.exists() else {}
    subjects_out = []

    for sid, name, en, accent, soft in SUBJECTS:
        chapters, overview = [], None
        for f in sorted((ROOT / "src" / "chapters" / sid).glob("*.json")):
            ch = load(f)
            if ch is None:
                continue
            cid = ch["id"]
            meta = pages.get(cid, {})
            entry = {
                "id": cid,
                "no": f.stem,
                "title": ch["title"],
                "subtitle": ch.get("subtitle", ""),
                "priority": ch.get("priority", ""),
                "meta": ch.get("meta", []),
                "pdf": f"pdf/{cid}.pdf",
                "pages": meta.get("count", 0),
                "kps": [
                    {
                        "id": kp.get("id") or f"kp-{i:02d}",
                        "name": kp["name"],
                        "freq": kp.get("freq", ""),
                        "level": kp.get("level", ""),
                        "page": meta.get("kps", {}).get(kp.get("id") or f"kp-{i:02d}"),
                    }
                    for i, kp in enumerate(ch.get("kps", []), 1)
                ],
                "topics": [
                    {
                        "id": tp.get("id") or f"topic-{i:02d}",
                        "name": tp["name"],
                        "page": meta.get("topics", {}).get(tp.get("id") or f"topic-{i:02d}"),
                    }
                    for i, tp in enumerate(ch.get("topics", []), 1)
                ],
                "summaryPage": meta.get("summary"),
                "examCount": sum(len(kp.get("exams", [])) for kp in ch.get("kps", [])),
            }
            if f.stem == "00":
                overview = entry
                continue
            chapters.append(entry)
            totals["chapters"] += 1
            totals["kps"] += len(entry["kps"])
            totals["topics"] += len(entry["topics"])
            totals["exams"] += entry["examCount"]
            totals["pages"] += entry["pages"]

        chapters.sort(key=lambda e: e["no"])
        subjects_out.append({
            "id": sid, "name": name, "en": en, "accent": accent, "soft": soft,
            "chapters": chapters,
            "overview": overview,
            "chapterCount": len(chapters),
            "kpCount": sum(len(e["kps"]) for e in chapters),
            "examCount": sum(e["examCount"] for e in chapters),
            "blurb": (overview or {}).get("subtitle", ""),
        })

    data = {
        "generated": "2026-11",
        "examDate": "2026-12-19",
        "subjects": subjects_out,
        "stats": totals,
    }
    dest = ROOT / "assets" / "data.js"
    dest.write_text("window.ATLAS = " + json.dumps(data, ensure_ascii=False, separators=(",", ":")) + ";\n",
                    encoding="utf-8")
    print(f"wrote {dest} — {totals}")


if __name__ == "__main__":
    main()
