# -*- coding: utf-8 -*-
"""Validate chapter JSON files: schema, LaTeX delimiters, CJK inside math."""
import json
import re
import sys
from pathlib import Path

CJK = re.compile(r"[㐀-鿿]")
REQ = {"id", "subject", "code", "title", "subtitle", "priority", "meta",
       "syllabus", "kps", "topics", "summary"}


def check(path):
    errs = []
    try:
        d = json.loads(Path(path).read_text(encoding="utf-8"))
    except Exception as e:
        return [f"JSON invalid: {e}"], None
    for k in REQ:
        if k not in d:
            errs.append(f"missing field {k}")
    if not re.fullmatch(r"[a-z]+-\d{2}", d.get("id", "")):
        errs.append(f"bad id {d.get('id')}")
    if d.get("subject") not in {"math", "english", "mechanics", "politics"}:
        errs.append("bad subject")
    if d.get("priority") not in {"S", "A", "B"}:
        errs.append("bad priority")
    kps = d.get("kps", [])
    if not (5 <= len(kps) <= 10):
        errs.append(f"kps count {len(kps)}")
    for kp in kps:
        for k in ["id", "name", "level", "freq", "core", "formulas", "exams",
                  "pitfalls", "teachers"]:
            if k not in kp:
                errs.append(f"{kp.get('id')} missing {k}")
        if not kp.get("exams"):
            errs.append(f"{kp.get('id')} has no exam")
        for fm in kp.get("formulas", []):
            t = fm.get("tex", "")
            if "\\" in t and not (t.startswith("\\(") or t.startswith("\\[")):
                errs.append(f"{kp.get('id')} raw latex: {t[:40]}")
            for m in re.finditer(r"\\\((.*?)\\\)", t):
                if CJK.search(m.group(1)):
                    errs.append(f"{kp.get('id')} CJK in math: {m.group(0)[:40]}")
    for tp in d.get("topics", []):
        for k in ["id", "name", "why", "method", "example", "trap"]:
            if k not in tp:
                errs.append(f"{tp.get('id')} missing {k}")
    return errs, (d, len(kps), len(d.get("topics", [])))


def main(patterns):
    for pat in patterns:
        for f in sorted(Path().glob(pat)):
            errs, info = check(f)
            if info:
                print(f"{f.name}: {info[1]} kps, {info[2]} topics")
            for e in errs:
                print(f"  ! {e}")


if __name__ == "__main__":
    main(sys.argv[1:] or ["src/chapters/*/*.json"])
