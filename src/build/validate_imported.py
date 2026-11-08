# -*- coding: utf-8 -*-
"""Validate imported-math-*.json: count, order, fields, page images."""
import json, re, sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
BANK = ROOT / "src" / "bank"


problems = []
FILES = sorted(list(BANK.glob("imported-math-*.json")) + list(BANK.glob("imported-mock-*.json")))
for f in FILES:
    try:
        items = json.loads(f.read_text(encoding="utf-8"))["items"]
    except Exception as e:
        problems.append(f"{f.name}: JSON 解析失败 {e}")
        continue
    is_mock = f.name.startswith("imported-mock-")
    if is_mock:
        n_expected, n_choice = 22, 10
    else:
        year = int(f.stem.rsplit("-", 1)[-1])
        n_expected = 23 if year <= 2020 else 22
        n_choice = 8 if year <= 2020 else 10
    n_fill = 6
    if len(items) != n_expected:
        problems.append(f"{f.name}: 题数 {len(items)} != {n_expected}")
    seen = set()
    for idx, it in enumerate(items, 1):
        tag = f"{f.name}#{it.get('id', '?')}"
        no = re.search(r"第(\d+)题", it.get("kpName", ""))
        if not no or int(no.group(1)) != idx:
            problems.append(f"{tag}: 题号不连续（应为第{idx}题，实际 {it.get('kpName')}）")
        if it.get("id") in seen:
            problems.append(f"{tag}: id 重复")
        seen.add(it.get("id"))
        for key in ("subject", "chapter", "chapterTitle", "kind", "text", "answer", "steps", "pageImage"):
            if not it.get(key):
                problems.append(f"{tag}: 缺字段 {key}")
        if not (it.get("steps") or []):
            problems.append(f"{tag}: steps 为空")
        elif len(it["steps"]) < 4:
            problems.append(f"{tag}: 步骤仅 {len(it['steps'])} 步")
        if it.get("pageImage") and not (ROOT / it["pageImage"]).exists():
            problems.append(f"{tag}: 缺题页图 {it['pageImage']}")
    for idx in range(min(n_choice, len(items))):
        if items[idx].get("kind") != "选择题":
            problems.append(f"{f.name}#第{idx+1}题: kind={items[idx].get('kind')}，应为 选择题")
    for idx in range(n_choice, min(n_choice + n_fill, len(items))):
        if items[idx].get("kind") != "填空题":
            problems.append(f"{f.name}#第{idx+1}题: kind={items[idx].get('kind')}，应为 填空题")
    for idx in range(n_choice + n_fill, len(items)):
        if items[idx].get("kind") not in ("计算题", "证明题"):
            problems.append(f"{f.name}#第{idx+1}题: 解答题 kind 应为计算/证明，实际 {items[idx].get('kind')}")

print(f"checked {len(FILES)} files")
if problems:
    print("\n".join(problems))
    sys.exit(1)
print("OK")
