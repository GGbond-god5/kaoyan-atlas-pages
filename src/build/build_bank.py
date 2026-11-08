# -*- coding: utf-8 -*-
"""Index local question-bank files under bank/<source-id>/ into assets/bank-files.js."""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SOURCES = [
    "pol-xiao1000", "pol-xiao8", "pol-xiao4", "pol-zhenti",
    "math-zhenti", "math-lin6", "math-zhang4", "math-hefei",
    "eng-zhenti", "eng-writing",
    "mech-zhenti", "mech-zhang", "mech-330",
]
EXTS = {".pdf", ".png", ".jpg", ".jpeg", ".webp", ".docx", ".md"}
README = "把该来源的题库文件（PDF/图片/Word）放到这个目录，然后运行：\npy src/build/build_bank.py\n"


def main():
    root = ROOT / "bank"
    root.mkdir(exist_ok=True)
    data = {}
    for sid in SOURCES:
        d = root / sid
        d.mkdir(exist_ok=True)
        readme = d / "把题库文件放这里.txt"
        if not readme.exists():
            readme.write_text(README, encoding="utf-8")
        files = []
        for f in sorted(d.rglob("*")):
            if f.is_file() and f.suffix.lower() in EXTS:
                files.append(f.relative_to(ROOT).as_posix())
        if files:
            data[sid] = files
    dest = ROOT / "assets" / "bank-files.js"
    dest.write_text("window.BANK_FILES=" + json.dumps(data, ensure_ascii=False, indent=1) + ";\n", encoding="utf-8")
    print("indexed sources:", len(data), "files:", sum(len(v) for v in data.values()))


if __name__ == "__main__":
    main()
