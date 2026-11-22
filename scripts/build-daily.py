"""每日一题题池：从 src/bank 抽各科独立客观单选题（无原文、含解析），
按年份与知识点分层抽样，生成 assets/daily-data.js（前端按日期轮换取题）。
只收：真题（isReal 为真，2026-11-22 起游客口径与题库分片一致）、kind 为单选类、text 内嵌 A–D 四个选项、answer 为 A–D、steps 非空、无 passage 的题。
运行：python3 scripts/build-daily.py
"""
import json, glob, re, random
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PER_SUBJECT = 60
SUBJECTS = ["math", "math2", "math3", "politics"]
OPT_RE = re.compile(r"(?:^|\n)\s*([A-D])[\.、]\s*")

def parse(q):
    t = q.get("text") or ""
    parts = OPT_RE.split(t)
    # parts: [stem, 'A', optA, 'B', optB, 'C', optC, 'D', optD]
    if len(parts) < 9: return None
    stem = parts[0].strip()
    opts = {}
    for i in range(1, 9, 2):
        opts[parts[i]] = parts[i + 1].strip()
    if set(opts) != {"A", "B", "C", "D"} or not stem: return None
    if any(not v for v in opts.values()): return None
    return stem, [opts[k] for k in "ABCD"]

pool = {s: [] for s in SUBJECTS}
for f in glob.glob(str(ROOT / "src/bank/*.json")):
    name = Path(f).name
    if "catalog" in name or "manifest" in name or "import-list" in name: continue
    try: d = json.load(open(f, encoding="utf-8"))
    except Exception: continue
    qs = d if isinstance(d, list) else (d.get("questions") or d.get("items") or [])
    for q in qs:
        s = q.get("subject")
        if s not in pool: continue
        if q.get("isReal") is not True: continue  # 只收真题：肖1000/模拟卷不进每日一题（游客可见）
        if q.get("passage"): continue
        if (q.get("kind") or "") not in ("选择题", "单选题", "单项选择题"): continue
        if (q.get("answer") or "") not in ("A", "B", "C", "D"): continue
        steps = [str(x).strip() for x in (q.get("steps") or []) if str(x).strip()]
        if not steps: continue
        parsed = parse(q)
        if not parsed: continue
        stem, opts = parsed
        pool[s].append({
            "id": q["id"], "subject": s, "stem": stem, "options": opts,
            "answer": q["answer"], "steps": steps,
            "kp": q.get("kpName") or "", "year": str(q.get("year") or ""),
            "real": bool(q.get("isReal")),
        })

out = {}
for s, items in pool.items():
    # 分层：先真题后其他，按知识点轮转抽，年份新者优先
    items.sort(key=lambda x: (not x["real"], -(int(x["year"]) if x["year"].isdigit() else 0)))
    by_kp = {}
    for it in items: by_kp.setdefault(it["kp"], []).append(it)
    buckets = list(by_kp.values())
    random.Random(2027).shuffle(buckets)
    picked = []
    while buckets and len(picked) < PER_SUBJECT:
        for b in list(buckets):
            if len(picked) >= PER_SUBJECT: break
            if b: picked.append(b.pop(0))
            if not b: buckets.remove(b)
    out[s] = picked
    print(s, "candidates", len(items), "picked", len(picked))

dest = ROOT / "assets" / "daily-data.js"
dest.write_text("window.DAILY_POOL = " + json.dumps(out, ensure_ascii=False, separators=(",", ":")) + ";\n", encoding="utf-8")
print("wrote", dest, dest.stat().st_size, "bytes")
