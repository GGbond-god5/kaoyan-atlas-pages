# -*- coding: utf-8 -*-
"""Survey every PDF in bank/: page count, text layer, first-page snippet."""
import json
from collections import Counter
from pathlib import Path

import pymupdf

ROOT = Path(__file__).resolve().parents[2]
BANK = ROOT / "bank"
OUT = ROOT / "src" / "bank" / "pdf-survey.json"


def main():
    rows = []
    for p in sorted(BANK.rglob("*.pdf")):
        try:
            doc = pymupdf.open(p)
            n = doc.page_count
            chars = 0
            for i in range(min(3, n)):
                chars += len(doc[i].get_text("text").strip())
            snippet = " ".join(doc[0].get_text("text").split())[:120]
            title = (doc.metadata or {}).get("title") or ""
            doc.close()
        except Exception as e:
            rows.append({"path": p.relative_to(BANK).as_posix(), "error": str(e)[:80]})
            continue
        rows.append({
            "path": p.relative_to(BANK).as_posix(),
            "size": p.stat().st_size,
            "pages": n,
            "text3": chars,
            "kind": "text" if chars > 200 else "scan",
            "title": title,
            "snippet": snippet,
        })
    OUT.write_text(json.dumps(rows, ensure_ascii=False, indent=1), encoding="utf-8")
    ok = [r for r in rows if "error" not in r]
    print("pdfs", len(ok), "errors", len(rows) - len(ok))
    print("kind", Counter(r["kind"] for r in ok))
    print("pages", sum(r["pages"] for r in ok), "size GB", round(sum(r["size"] for r in ok) / 1e9, 2))
    print("\n-- hash-named / unlabeled --")
    for r in ok:
        name = Path(r["path"]).name
        if len(name) < 30 and "-" in name and not name.replace("-", "").replace(".pdf", "").isalnum():
            continue
        if name.count("-") >= 3 and "考研" not in name:
            print(f"  {r['kind']:4} {r['pages']:4}p  {r['path']}  :: {r['snippet'][:70]}")


if __name__ == "__main__":
    main()
