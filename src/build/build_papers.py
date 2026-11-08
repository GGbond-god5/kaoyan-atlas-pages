# -*- coding: utf-8 -*-
"""Build assets/papers.js: complete-paper archive for 套卷 mode."""
import json, os
from pathlib import Path
import fitz

ROOT = Path(__file__).resolve().parents[2]
BASE = "bank/_分类/模拟题/数学一/"
REAL_DIR = "bank/00.考研数学（一二三）09-25真题+解析+做题本/考研数学一历年真题做题本/"

real = []
for y in range(2009, 2026):
    exam = f"{REAL_DIR}考研数学一真题09-25/{y}考研数学一真题.pdf"
    sol = f"{REAL_DIR}考研数学一真题【解析】09-25/{y}考研数学一真题【解析】.pdf"
    if (ROOT / exam).exists():
        real.append({"title": f"{y} 数学一 真题", "year": y, "subject": "数学一",
                     "exam": exam, "solution": sol if (ROOT / sol).exists() else "",
                     "transcribed": f"math-{y}" if y in (2024, 2025) else ""})

mock = [
    ("2026 李林六套卷（数一）", "李林/26李林《六套卷》数一「试题」.pdf", "李林/26李林《六套卷》数一「解析」.pdf"),
    ("2025 李林六套卷（数一）", "李林/25李林6套卷（数一）试题「公众号：考研资料直通车」.pdf", "李林/25李林6套卷（数一）答案「公众号：考研资料直通车」.pdf"),
    ("2025 李林四套卷（数一）", "李林/25李林4套卷（数一）试卷「公众号：考研资料直通车」.pdf", "李林/25李林4套卷（数一）答案「公众号：考研资料直通车」.pdf"),
    ("2026 张宇八套卷（数一）", "bank/张宇/2026年/张八/数一/26张宇八套卷数一【试题】 .pdf", "bank/张宇/2026年/张八/数一/26张宇八套卷数一【解析】.pdf"),
    ("2026 张宇四套卷（数一）", "bank/张宇/2026年/张四/数一/【试卷】26考研张宇四套卷（数一）.pdf", "bank/张宇/2026年/张四/数一/【解析】26考研张宇四套卷（数一）.pdf"),
    ("2025 张宇八套卷（数一）", "bank/张宇/2025年/25张宇8套卷「公众号：考研资料直通车」/数一/25张宇8套卷数一试题「公众号：考研资料直通车」.pdf", "bank/张宇/2025年/25张宇8套卷「公众号：考研资料直通车」/数一/25张宇8套卷数一解析「公众号：考研资料直通车」.pdf"),
    ("2025 张宇四套卷（数一）", "bank/张宇/2025年/25张宇4套卷「公众号：考研资料直通车」/数一/25张宇4套卷（数一）试题「公众号：考研资料直通车」.pdf", "bank/张宇/2025年/25张宇4套卷「公众号：考研资料直通车」/数一/25张宇4套卷（数一）解析「公众号：考研资料直通车」.pdf"),
    ("2026 李艳芳三套卷（数一）", "李艳芳/【竖版】26李艳芳三套卷数一.pdf", "李艳芳/【解析】李艳芳三套卷数一答案.pdf"),
    ("2025 合工大超越 5+5（数一）", "合工大超越/25合工大超越5+5套卷数一试题册「公众号：考研资料直通车」.pdf", "合工大超越/25合工大超越5+5套卷数一解析册「公众号：考研资料直通车」.pdf"),
    ("2026 合工大超越（数一）", "合工大超越/26合工大超越（数一）试卷.pdf", ""),
    ("欧几里得万人模考·10月（数一）", "欧几里得/【试题】欧几里得万人模考10月试卷数一.pdf", "欧几里得/【解析】欧几里得万人模考10月试卷数一.pdf"),
    ("欧几里得万人模考·11月（数一）", "欧几里得/欧几里得万人模考11月试卷数一.pdf", "欧几里得/欧几里得万人模考11月试卷数一 答案.pdf"),
]
mock_items = []
missing = []
for title, exam, sol in mock:
    ep = exam if exam.startswith("bank/") else BASE + exam
    sp = (sol if sol.startswith("bank/") else BASE + sol) if sol else ""
    if not (ROOT / ep).exists():
        missing.append(ep)
        continue
    if sp and not (ROOT / sp).exists():
        missing.append(sp)
        sp = ""
    mock_items.append({"title": title, "year": 0, "subject": "数学一",
                       "exam": ep, "solution": sp, "transcribed": ""})


def pages(path):
    if not path:
        return 0
    try:
        d = fitz.open(ROOT / path)
        n = len(d)
        d.close()
        return n
    except Exception:
        return 0


for it in real + mock_items:
    it["pages"] = pages(it["exam"])
    it["solutionPages"] = pages(it["solution"])

# English (英语一) real papers: archived originals; transcribed years get a bank chapter too.
ENG12 = "bank/eng-zhenti/02、1998-2009年考研英语真题+解析/"
ENG10 = "bank/eng-zhenti/03、2010-2024年考研英语真题+解析/"
eng = []
for y in range(2009, 2025):
    if y == 2009:
        exam = ENG12 + "1998-2009年考研英语真题/2009年考研英语真题.pdf"
        sol = ENG12 + "1998-2009年考研英语解析/2009年考研英语真题解析.pdf"
    else:
        exam = f"{ENG10}2010-2024考研英语真题/{y}年考研英语一真题.pdf"
        sol = f"{ENG10}2010-2024考研英语解析/{y}年考研英语一真题解析.pdf"
    if not (ROOT / exam).exists():
        missing.append(exam)
        continue
    eng.append({"title": f"{y} 英语一 真题", "year": y, "subject": "英语一", "subjectId": "english",
                "exam": exam, "solution": sol if (ROOT / sol).exists() else "", "transcribed": ""})
y = 2025
exam = ("bank/eng-zhenti/2025考研英语真题和答案【完整版】/2025考研英语一真题及答案/版本二/"
        "2025年全国硕士研究生招生考试英语（一）试题-完整版.pdf")
sol = ("bank/eng-zhenti/2025考研英语真题和答案【完整版】/2025考研英语一真题及答案/版本二/"
       "参考答案-完整版.pdf")
if (ROOT / exam).exists():
    eng.append({"title": f"{y} 英语一 真题", "year": y, "subject": "英语一", "subjectId": "english",
                "exam": exam, "solution": sol if (ROOT / sol).exists() else "", "transcribed": ""})
for it in eng:
    it["pages"] = pages(it["exam"])
    it["solutionPages"] = pages(it["solution"])
real.extend(eng)

data = {"real": real, "mock": mock_items}
dest = ROOT / "assets" / "papers.js"
dest.write_text("window.PAPERS=" + json.dumps(data, ensure_ascii=False, separators=(",", ":")) + ";\n",
                encoding="utf-8")
print("real", len(real), "mock", len(mock_items), "size", dest.stat().st_size)
print("missing", missing)
