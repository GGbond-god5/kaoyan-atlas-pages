# -*- coding: utf-8 -*-
"""Collapse 3+ consecutive backslashes (over-escaped LaTeX row breaks) to exactly two."""
import json
import glob
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
PAT = re.compile(r"[\\]{3,}")


def fix(o):
    if isinstance(o, dict):
        return {k: fix(v) for k, v in o.items()}
    if isinstance(o, list):
        return [fix(v) for v in o]
    if isinstance(o, str):
        return PAT.sub(lambda m: "\\\\", o)
    return o


def main():
    changed = 0
    for f in glob.glob(str(ROOT / "src/chapters/*/*.json")):
        p = Path(f)
        doc = json.loads(p.read_text(encoding="utf-8"))
        new = fix(doc)
        if new != doc:
            p.write_text(json.dumps(new, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
            changed += 1
    print("normalized", changed, "files")


if __name__ == "__main__":
    main()
