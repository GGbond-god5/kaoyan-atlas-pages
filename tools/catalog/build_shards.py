#!/usr/bin/env python3
"""把 raw/ 抓取结果打包成站点静态目录：
assets/catalog/index.json（学校索引）+ assets/catalog/<dwdm>.json（单校专业/方向/科目）。
用法：python3 build_shards.py <repo-assets-dir>"""
import json, os, sys

ROOT = os.path.dirname(os.path.abspath(__file__))
RAW = os.path.join(ROOT, "raw")

def main():
    out_dir = sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, "catalog-out")
    cat_dir = os.path.join(out_dir, "catalog")
    os.makedirs(cat_dir, exist_ok=True)
    schools = json.load(open(os.path.join(RAW, "schools.json"), encoding="utf-8"))
    index, done, missing = [], 0, 0
    total_bytes = 0
    for s in schools:
        p = os.path.join(RAW, f"{s['dwdm']}.json")
        if not os.path.exists(p):
            missing += 1
            continue
        d = json.load(open(p, encoding="utf-8"))
        programs = []
        for prog in d["programs"]:
            colleges = {}
            for dr in prog["dirs"]:
                colleges.setdefault(dr["college"], []).append(
                    {"n": dr["dir"], "m": dr["xxfs"], "s": dr["subjects"]})
            programs.append({"code": prog["code"], "name": prog["name"], "type": prog["type"],
                             "colleges": [{"name": c, "dirs": ds} for c, ds in colleges.items()]})
        shard = {"dwdm": s["dwdm"], "name": s["name"], "province": s["province"], "programs": programs}
        text = json.dumps(shard, ensure_ascii=False, separators=(",", ":"))
        open(os.path.join(cat_dir, f"{s['dwdm']}.json"), "w", encoding="utf-8").write(text)
        total_bytes += len(text.encode("utf-8"))
        index.append({"dwdm": s["dwdm"], "name": s["name"], "province": s["province"],
                      "zhx": s["zhx"], "syl": s["syl"], "bs": s["bs"], "n": len(programs)})
        done += 1
    index_text = json.dumps(index, ensure_ascii=False, separators=(",", ":"))
    open(os.path.join(cat_dir, "index.json"), "w", encoding="utf-8").write(index_text)
    print(f"学校 {done} 所已打包（缺 {missing}），索引 {len(index_text)//1024} KB，分片共 {total_bytes//1024//1024} MB")

if __name__ == "__main__":
    main()
