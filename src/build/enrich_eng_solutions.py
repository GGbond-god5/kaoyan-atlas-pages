# -*- coding: utf-8 -*-
"""Attach detailed Chinese analysis (from the bank's 解析 books) to English items.

Scanned books are OCR'd once at 300 dpi; text-layer books are read directly.
"""
import glob
import json
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
BANK = ROOT / "bank/eng-zhenti"
D12 = BANK / "02、1998-2009年考研英语真题+解析/1998-2009年考研英语解析"
D10 = BANK / "03、2010-2024年考研英语真题+解析/2010-2024考研英语解析"
OCRROOT = ROOT / "_ocr"
OUT = ROOT / "src" / "bank"

BOOKS = {2009: D12 / "2009年考研英语真题解析.pdf"}
for y in range(2010, 2024):
    BOOKS[y] = D10 / f"{y}年考研英语一真题解析.pdf"

TAG = re.compile(r"[【\[]((?:精准定位|解题思路|命题解密|考点提炼|技巧总结|错项排除|干扰排除|正确项|错误项|定位|分析|解析|干扰)[^】\]]*)[】\]]")


def norm_cn(t):
    for a, b in [(r"(?<=[一-鿿])\s+(?=[一-鿿])", ""),
                 (r"(?<=[一-鿿])\s+(?=[，。；：、！？（）【】])", ""),
                 (r"(?<=[，。；：、！？（）【】])\s+(?=[一-鿿])", "")]:
        t = re.sub(a, b, t)
    return t


def pdf_text(path):
    import pymupdf
    return "\n".join(pg.get_text() for pg in pymupdf.open(str(path)))


def ocr_text(year, path):
    d = OCRROOT / f"sol{year}"
    files = sorted(d.glob("*.txt"))
    if not files:
        d.mkdir(parents=True, exist_ok=True)
        import pymupdf
        doc = pymupdf.open(str(path))
        for i, pg in enumerate(doc):
            pg.get_pixmap(dpi=300, colorspace=pymupdf.csGRAY).save(str(d / f"p{i+1:02d}.png"))
        subprocess.run(["powershell", "-NoProfile", "-ExecutionPolicy", "Bypass",
                        "-File", str(ROOT / "src/build/win_ocr_batch.ps1"), "-Dir", str(d)],
                       check=False, capture_output=True)
        files = sorted(d.glob("*.txt"))
    return "\n".join(open(f, encoding="utf-8-sig").read() for f in files)


def analyse(year):
    path = BOOKS[year]
    raw = pdf_text(path)
    if len(re.sub(r"\s", "", raw)) < 5000:
        raw = ocr_text(year, path)
    t = norm_cn(raw).replace("［", "[").replace("］", "]")
    t = re.sub(r"\[\s*([^\]\n]{1,16}?)\s*\]", r"[\1]", t)
    marks = list(re.finditer(r"(?m)^\s*(\d{1,2})\s*[.．，,·]\s*", t))
    segs = {}
    for i, m in enumerate(marks):
        n = int(m.group(1))
        if not 1 <= n <= 45:
            continue
        end = marks[i + 1].start() if i + 1 < len(marks) else len(t)
        seg = t[m.start():end]
        if n not in segs or len(seg) > len(segs[n]):
            segs[n] = seg
    out = {}
    for n, seg in segs.items():
        # drop the printed question/options before the first Chinese analysis tag
        tag = TAG.search(seg)
        if not tag:
            continue
        body = seg[tag.start():]
        parts = []
        cur = ""
        pos = 0
        for m in TAG.finditer(body):
            if m.start() > pos:
                chunk = body[pos:m.start()].strip(" ｜|")
                if chunk:
                    cur = (cur + " " + chunk).strip()
            if cur:
                parts.append(cur)
            cur = ""
            pos = m.end()
        tail = body[pos:].strip(" ｜|")
        if tail:
            cur = (cur + " " + tail).strip()
        if cur:
            parts.append(cur)
        parts = [re.sub(r"\s+", " ", p).strip() for p in parts if len(p.strip()) > 12]
        if not parts:
            continue
        text = " ".join(parts)
        if len(text) > 1200:
            text = text[:1200] + "…"
        out[n] = text
    return out


def pick_answer(text):
    hits = []
    for pat in (r"\[?\s*([A-G])\s*\]?\s*(?:项)?\s*正确", r"正确答案为\s*([A-G])", r"故选\s*([A-G])"):
        hits += re.findall(pat, text)
    return hits[-1] if hits else ""


def main(years):
    for y in years:
        f = OUT / f"imported-eng-{y}.json"
        if not f.exists():
            print(y, "no bank file, skip")
            continue
        data = json.loads(f.read_text(encoding="utf-8"))
        ana = analyse(y)
        n_ok = 0
        for it in data["items"]:
            n = int(it["id"].rsplit("-", 1)[1])
            a = ana.get(n)
            if not a:
                continue
            got = pick_answer(a)
            if got and len(got) == 1:
                it["answer"] = got
            base = [f"参考答案：{it['answer']}"] if it["answer"] else []
            it["steps"] = base + [a]
            n_ok += 1
        f.write_text(json.dumps(data, ensure_ascii=False, indent=1), encoding="utf-8")
        print(y, "attached", n_ok, "of", len(data["items"]))


if __name__ == "__main__":
    years = [int(x) for x in sys.argv[1:]] or [2010, 2011, 2012, 2013, 2014, 2015, 2016, 2017, 2018, 2020, 2021]
    main(years)