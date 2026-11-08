# -*- coding: utf-8 -*-
"""把肖秀荣 1000 题（2027 版）导入大观题库，沿用既有刷题页数据契约。

试题分册有文字层：按页眉识别「部分 + 题型」，按「选项 A→B→C→D 四连」切题
（题号在文字层有丢失，只当弱锚点）；材料分析题无选项，改按题号切。
解析册是纯扫描件（文字层 0）：先用 win_ocr_batch.ps1 转成 _ocr/xiao1000/txt/*.txt，
再按「N. 答案 X」切块对齐。

用法：
    py -3 src/build/import_xiao1000.py             # 解析 + 诊断（不写盘）
    py -3 src/build/import_xiao1000.py --write     # 写 src/bank/imported-pol-x1000.json
    py -3 src/build/import_xiao1000.py --pages     # 只为有题的页面导出整页图
"""
import argparse
import json
import re
from collections import Counter, OrderedDict, defaultdict
from pathlib import Path

import pymupdf

ROOT = Path(__file__).resolve().parents[2]
Q_PDF = ROOT / "bank" / "pol-xiao1000" / "27版肖1000试题分册【冲冲研岸】独家提供.pdf"
A_PDF = ROOT / "bank" / "pol-xiao1000" / "27版肖1000答案解析册_扫描版.pdf"
OCR_TXT = ROOT / "src" / "cache" / "x1000" / "txt"
PAGES_DIR = ROOT / "content" / "x1000-pages"
OUT = ROOT / "src" / "bank" / "imported-pol-x1000.json"

PART_CHAPTER = {
    "一": ("pol-01", "肖1000 · 马克思主义基本原理"),
    "二": ("pol-03", "肖1000 · 毛泽东思想和中国特色社会主义理论体系概论"),
    "三": ("pol-04", "肖1000 · 习近平新时代中国特色社会主义思想概论"),
    "四": ("pol-05", "肖1000 · 中国近现代史纲要"),
    "五": ("pol-06", "肖1000 · 思想道德与法治"),
}
KIND = {"单项选择题": "单选题", "多项选择题": "多选题", "材料分析题": "分析题"}
PART_NAME = {"一": "马原", "二": "毛中特", "三": "习思想", "四": "史纲", "五": "思道法"}
SIDE_TYPE = {"单选": "单项选择题", "多选": "多项选择题", "分析": "材料分析题"}

RE_PART = re.compile(r"第\s*([一二三四五])\s*部分")
RE_TYPE = re.compile(r"(单项选择题|多项选择题|材料分析题)")
RE_TYPEHEAD = re.compile(r"^[一二三四五六七八九十]+\s*[、.．]\s*(单项选择题|多项选择题|材料分析题)$")
RE_CHAPTER = re.compile(r"^(第[一二三四五六七八九十]+章|导论|绪论)\s*(.*)$")
RE_QNUM = re.compile(r"^(\d{1,3})\s*[.．、,，:：]\s*(\S.*)$")
RE_INLINE_OPT = re.compile(r"(?<![A-Za-z0-9])([A-D])(?:\s*[.．、,，·:：]\s*|\s+)")
RE_NOISE = re.compile(
    r"^\d{1,4}$|考研政治\s*1000\s*题|^2027\s*考研政治|"
    r"^(马原|毛中特|习思想|习概|史纲|思道法)\s*[·，,]?\s*(单选|多选|分析)?$"
)
# 侧边栏书眉（如「马原·单选」），可能和正文被聚到同一视觉行
RE_SIDE = re.compile(r"^(马原|毛中特|习思想|习概|史纲|思道法)\s*[·，,]?\s*(单选|多选|分析)$")


def norm(s):
    return re.sub(r"[ \t\u3000\xa0]+", " ", s).strip()


def page_lines(doc, pno):
    """按 y 聚类合成视觉行——选项常排成双栏（A|B、C|D），单靠 block 会拆散。"""
    raw = []
    for b in doc[pno].get_text("rawdict")["blocks"]:
        if b["type"] != 0:
            continue
        for l in b["lines"]:
            t = "".join(c["c"] for sp in l["spans"] for c in sp["chars"])
            t = norm(t)
            if t:
                raw.append((l["bbox"][1], l["bbox"][0], t))
    raw.sort(key=lambda t: (t[0], t[1]))
    rows = []
    for y, x, t in raw:
        if rows and abs(y - rows[-1][0]) <= 8:
            rows[-1][1].append((x, t))
        else:
            rows.append([y, [(x, t)]])
    out = []
    for y, parts in rows:
        parts.sort()
        segs = [p[1] for p in parts if not RE_SIDE.match(p[1])]
        if segs:
            out.append((round(y), round(parts[0][0]), " ".join(segs)))
    return out


def header_of(lines):
    part = qtype = None
    for y, x, t in lines:
        if y <= 44 and RE_PART.search(t) and RE_TYPE.search(t):
            part = part or RE_PART.search(t).group(1)
            qtype = qtype or RE_TYPE.search(t).group(1)
        if len(t) <= 18 and (x >= 380 or y <= 110):
            for k, v in SIDE_TYPE.items():
                if k in t:
                    qtype = qtype or v
    return part, qtype


def split_opts(text):
    """拆选项行。允许单行只有 B./C./D.（双栏排版时 A 与 B 同行、C 与 D 同行）。"""
    hits = list(RE_INLINE_OPT.finditer(text))
    if not hits:
        return None
    # 必须以某个选项字母打头（行首），否则是题干正文里出现 "A." 之类
    first = hits[0]
    if first.start() > 2:
        return None
    segs = []
    for i, m in enumerate(hits):
        end = hits[i + 1].start() if i + 1 < len(hits) else len(text)
        segs.append([m.group(1), text[m.end():end].strip()])
    letters = [s[0] for s in segs]
    # 字母必须严格递增
    order = "ABCD"
    pos = [order.index(l) for l in letters]
    if pos != sorted(set(pos)):
        return None
    return segs


def read_stream():
    doc = pymupdf.open(str(Q_PDF))
    part = qtype = None
    stream = []
    for pno in range(len(doc)):
        lines = page_lines(doc, pno)
        hp, ht = header_of(lines)
        if hp:
            part = hp
        if ht:
            qtype = ht
        for y, x, t in lines:
            if RE_NOISE.match(t):
                continue
            if y <= 44 and RE_PART.search(t) and RE_TYPE.search(t):
                continue
            th = RE_TYPEHEAD.match(t)
            if th:
                stream.append(("TYPE", th.group(1), pno + 1, part, qtype))
                continue
            mc = RE_CHAPTER.match(t)
            if mc and len(t) <= 46:
                stream.append(("CHAPTER", norm(mc.group(1) + " " + (mc.group(2) or "")), pno + 1, part, qtype))
                continue
            segs = split_opts(t)
            if segs:
                for letter, body in segs:
                    stream.append((letter, body, pno + 1, part, qtype))
            else:
                stream.append(("text", t, pno + 1, part, qtype))
    return stream


def assemble(stream):
    """选择题以 A→D 选项组切题；分析题按题号切。题号只用于校准，不强制连续。"""
    items = []
    part = qtype = None
    chapter = ""
    cur = None
    last_no = defaultdict(int)

    def newq(page, no=0):
        return {"no": no, "part": part, "type": qtype, "chapter": chapter,
                "page": page, "stem": [], "opts": []}

    def flush():
        nonlocal cur
        if cur and cur["stem"]:
            key = (cur["part"], cur["type"])
            if cur["no"]:
                last_no[key] = max(last_no[key], cur["no"])
            items.append(cur)
        cur = None

    for kind, text, page, hp, ht in stream:
        if hp:
            if part and hp != part:
                flush()
                chapter = ""
            part = hp
        if kind == "TYPE":
            flush()
            qtype = text
            chapter = ""
            continue
        if kind == "CHAPTER":
            flush()
            chapter = text
            continue

        if kind == "text":
            mq = RE_QNUM.match(text)
            analysis = qtype == "材料分析题"
            # 上一题选项已收满（说明它是完整的），这时遇到文本行就是下一题开头
            full = cur is not None and len(cur["opts"]) >= 4
            if full and not mq:
                flush()
                cur = newq(page)
                cur["stem"].append(text)
                continue
            ready = cur is None or len(cur["opts"]) >= 2 or analysis
            if mq and qtype and ready:
                flush()
                cur = newq(page, int(mq.group(1)))
                cur["stem"].append(mq.group(2))
                continue
            if cur is None:
                cur = newq(page)
            if cur["opts"]:
                cur["opts"][-1][1] += text
            else:
                cur["stem"].append(text)
            continue

        # 选项行
        if cur is None:
            cur = newq(page)
        if not cur["stem"]:
            continue
        if kind == "A" and cur["opts"]:
            flush()                      # 上一题选项已收，新 A 表示题号丢失的下一题
            cur = newq(page)
            if not qtype:
                continue
        cur["opts"].append([kind, text])
    flush()

    # 补题号：按段内递增
    seq = defaultdict(int)
    for it in items:
        k = (it["part"], it["type"])
        if it["no"] and it["no"] > seq[k]:
            seq[k] = it["no"]
        elif not it["no"]:
            seq[k] += 1
            it["no"] = seq[k]
    # 丢弃封面 / 目录页产生的幽灵题（没有部分或题型）
    items = [it for it in items if it["part"] and it["type"] in KIND]
    return items


def build_text(it):
    lines = ["".join(it["stem"]).strip()]
    for l, t in it["opts"]:
        lines.append(f"{l}. {t}")
    return "\n".join(lines)


# ---------------- 解析册（扫描件 OCR） ----------------

RE_ANS_HEAD = re.compile(r"(\d{1,3})\s*[·.．,，、]?\s*答[^A-D]{0,4}([A-D]{1,4})(?![A-Za-z])")
RE_SEC_HEAD = re.compile(r"第([一二三四五])部分")


def load_answer_ocr():
    """解析册 OCR → 按页顺序的答案块流。

    解析册题号 OCR 损坏严重（答案字常识别成「泉/禀」），但答案字母和题号数字
    大体可用；因此这里只抽「N ... 答 X」序列。每块正文截到下一条答案标题为止，
    避免把下一题的解析吃进来。
    """
    files = sorted(OCR_TXT.glob("*.txt")) if OCR_TXT.exists() else []
    blocks = []
    for f in files:
        raw = f.read_text(encoding="utf-8-sig", errors="ignore")
        flat = re.sub(r"\s+", "", raw)
        sec = RE_SEC_HEAD.search(flat[:120])
        hits = list(RE_ANS_HEAD.finditer(flat))
        for i, m in enumerate(hits):
            end = hits[i + 1].start() if i + 1 < len(hits) else len(flat)
            body = flat[m.end():end]
            # 丢弃空块（页边噪声）——长度 >0 的块都有答案载荷，不能丢
            if len(body) < 6:
                continue
            blocks.append({
                "no": int(m.group(1)),
                "answer": m.group(2).upper(),
                "part": sec.group(1) if sec else None,
                "text": body,
                "file": f.name,
            })

    # 跨页碎片：题号回退且正文很短的块是上一题的换页残留，合并回上一块
    merged = []
    for b in blocks:
        if merged and b["no"] < merged[-1]["no"] and len(b["text"]) < 120:
            merged[-1]["text"] += b["text"]
            continue
        merged.append(b)
    return merged


def fix_letters(s):
    """OCR 常把选项字母认错：0→D、C 被写成 c、@→A。统一成大写 ABCD。"""
    s = s.replace("0", "D").replace("@", "A").replace("℃", "C")
    s = s.upper()
    return "".join(ch for ch in s if ch in "ABCD")


def answer_from_text(text):
    """解析正文末句「X正确」就是本题答案——比 OCR 的答案标题更可靠。"""
    claims = re.findall(r"([A-D0@](?:\s*[、,，]\s*[A-D0@])*)\s*正\s*确", text)
    if not claims:
        return ""
    last = fix_letters(claims[-1])
    return "".join(sorted(set(last)))


def split_answer_text(text):
    """从解析正文里剥出 简析 / 点拨。"""
    core = re.sub(r"^[，,、.]*", "", text)
    core = re.sub(r"^出处[^简点]*?考点[\d.\-—()（）]*", "", core)
    core = re.sub(r"^出处[^简点]*", "", core)
    core = re.sub(r"^[简点][析拨][》〉]?", "", core)
    m = re.search(r"[点點]拨[》〉]?", core)
    if m:
        core = core[:m.start()]
    core = re.sub(r"^[丿/》〉\s]+", "", core)
    return core.strip()


def _grams(s, n=2):
    s = re.sub(r"[^\u4e00-\u9fa5A-Za-z0-9]", "", s or "")
    return {s[i:i + n] for i in range(len(s) - n + 1)}


def attach_answers(items):
    """把解析册答案/简析挂到题上。

    解析册 OCR 的题号不可靠（跳号/串号/0），但**解析正文与题干共享大量词汇**
    （题干的关键词、选项措辞会在简析里复现）。因此以「字二元组覆盖率」做内容
    匹配：对每题在块流窗口内取覆盖率最高且高于阈值的块，阈值不达则留空。
    这样宁可少挂，也不把错的答案贴到题上。
    """
    blocks = load_answer_ocr()
    if not blocks:
        print("!! 解析册 OCR 文本为空，answer/steps 留空")
        return 0
    for b in blocks:
        b["truth"] = answer_from_text(b["text"])
        b["grams"] = _grams(b["text"])

    hit = conf = 0
    used = [False] * len(blocks)
    MIN_COVER = 0.30      # 覆盖率低于此值判为「无法确认」
    MIN_INTER = 8         # 交集绝对量下限，防短句碰撞
    for it in items:
        stem = "".join(it["stem"]) + "".join(t for _, t in it["opts"])
        gq = _grams(stem)
        if not gq:
            continue
        best, best_k = 0.0, None
        for k, b in enumerate(blocks):
            gb = b["grams"]
            if used[k] or not gb:
                continue
            inter = len(gq & gb)
            if inter < MIN_INTER:
                continue
            # 解析通常只复用题干的一部分措辞，所以以「较短一方被覆盖的比例」为准，
            # 再用交集绝对量做下限，避免短句碰撞。
            cov = inter / max(1, min(len(gq), len(gb)))
            if cov > best:
                best, best_k = cov, k
        if best_k is None or best < MIN_COVER:
            continue
        used[best_k] = True
        b = blocks[best_k]
        cursor = min(best_k + 1, len(blocks))
        ans = b["truth"] or fix_letters(b["answer"])
        ans = ans[:1] if it["type"] == "单项选择题" else "".join(sorted(set(ans)))
        if not ans:
            continue
        it["answer"] = ans
        it["ansConfident"] = best >= 0.45
        body = split_answer_text(b["text"])
        if body:
            it["steps"] = [body] if len(body) <= 300 else _split_sent(body)
        hit += 1
        if it["ansConfident"]:
            conf += 1

    print(f"答案命中 {hit}/{len(items)}，其中高置信 {conf}")
    return hit


def _split_sent(s, limit=240):
    """把长解析按句切成多条 steps，便于刷题页逐条显示。"""
    parts, buf = [], ""
    for ch in s:
        buf += ch
        if ch in "。！？" and len(buf) >= limit:
            parts.append(buf.strip())
            buf = ""
    if buf.strip():
        parts.append(buf.strip())
    return parts or [s]


def _final_answer(it):
    """只输出可信答案。多选题若只 OCR 出一个字母，说明解析册答案被截断，
    这个字母不能当答案用——否则页面会按「全选对」判分，必然判错。"""
    if not it.get("ansConfident"):
        return ""
    ans = it.get("answer") or ""
    if not ans:
        return ""
    if it["type"] == "多项选择题" and len(ans) < 2:
        return ""
    if it["type"] == "单项选择题" and len(ans) != 1:
        return ""
    if it["type"] == "材料分析题":
        return ""      # 主观题没有字母答案，混进来的一定是错配
    return ans


def report(items):
    seg = defaultdict(list)
    for it in items:
        seg[(it["part"], it["type"])].append(it["no"])
    print(f"抽出题目 {len(items)}")
    tot_gap = 0
    for k in sorted(seg, key=lambda x: (str(x[0]), str(x[1]))):
        nums = seg[k]
        c = Counter(nums)
        mn, mx = min(nums), max(nums)
        miss = [n for n in range(mn, mx + 1) if n not in c]
        dup = [n for n in c if c[n] > 1]
        tot_gap += len(miss)
        print(f"  {k[0]}/{k[1]}: {len(nums)} 题  号 {mn}..{mx}  缺{len(miss)} {miss[:10]}  重{dup[:6]}")
    print("缺口合计", tot_gap,
          "| 选项数分布", dict(sorted(Counter(len(i['opts']) for i in items).items())))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--write", action="store_true")
    ap.add_argument("--pages", action="store_true")
    args = ap.parse_args()

    items = assemble(read_stream())
    report(items)
    attach_answers(items)
    answered = sum(1 for i in items if i.get("answer"))
    print("有答案题数", answered, "/", len(items))

    if args.pages:
        PAGES_DIR.mkdir(parents=True, exist_ok=True)
        doc = pymupdf.open(str(Q_PDF))
        pages = sorted({it["page"] for it in items})
        for p in pages:
            doc[p - 1].get_pixmap(dpi=110).save(str(PAGES_DIR / f"{p:03d}.jpg"))
        print("导出整页图", len(pages), "→", PAGES_DIR)

    if args.write:
        out = []
        for it in items:
            if not it["part"] or it["type"] not in KIND:
                continue
            ch, ctitle = PART_CHAPTER[it["part"]]
            kind = KIND[it["type"]]
            out.append({
                "id": f"x1000-{it['part']}{kind[0]}-{it['no']}",
                "subject": "politics",
                "subjectName": "政治",
                "chapter": ch,
                "chapterTitle": ctitle,
                "kp": f"x1000-{it['part']}-{kind}",
                "kpName": f"{it['chapter'] or PART_NAME[it['part']]} 第{it['no']}题",
                "kind": kind,
                "difficulty": "中",
                "year": "",
                "source": "肖秀荣 1000 题（2027）",
                "isReal": False,
                "text": build_text(it),
                "answer": _final_answer(it),
                "steps": it.get("steps", []) if _final_answer(it) else [],
                "figures": [],
                "pageImage": f"content/x1000-pages/{it['page']:03d}.jpg",
                "sourcePdf": "bank/pol-xiao1000/27版肖1000试题分册【冲冲研岸】独家提供.pdf",
                "sourcePage": it["page"],
            })
        OUT.write_text(json.dumps({"items": out}, ensure_ascii=False, indent=1), encoding="utf-8")
        print("written", OUT.name, len(out))


if __name__ == "__main__":
    main()