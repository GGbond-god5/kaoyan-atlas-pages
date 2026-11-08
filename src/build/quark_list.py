# -*- coding: utf-8 -*-
"""List a Quark share (read-only) and cache the tree for import planning."""
import json
import sys
import time
import urllib.parse
import urllib.request
from pathlib import Path

SHARE = "6aaa1f130dd0"
ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "src" / "bank" / "quark-tree.json"
API = "https://drive-pc.quark.cn/1/clouddrive/share/sharepage"


def token():
    req = urllib.request.Request(f"{API}/token?pr=ucpro&fr=pc",
                                 data=json.dumps({"pwd_id": SHARE, "passcode": ""}).encode(),
                                 headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.load(r)["data"]["stoken"]


def detail(stoken, fid, page, size=100):
    q = urllib.parse.urlencode({
        "pr": "ucpro", "fr": "pc", "pwd_id": SHARE, "stoken": stoken,
        "pdir_fid": fid, "force": "0", "_page": page, "_size": size,
        "_fetch_banner": "0", "_fetch_share": "0", "_fetch_total": "1",
        "_sort": "file_type:asc,updated_at:desc",
    })
    with urllib.request.urlopen(f"{API}/detail?{q}", timeout=30) as r:
        return json.load(r)["data"]


def list_all(stoken, fid):
    out, page = [], 1
    while True:
        d = detail(stoken, fid, page)
        items = d.get("list") or []
        out.extend(items)
        if len(items) < 100:
            break
        page += 1
        time.sleep(0.12)
    return out


def main():
    stoken = token()
    tree = []
    queue = [("0", "", 0)]
    while queue:
        fid, parent, depth = queue.pop(0)
        try:
            items = list_all(stoken, fid)
        except Exception as e:
            print("ERR", parent, e)
            continue
        for it in items:
            path = f"{parent}/{it['file_name']}"
            node = {
                "fid": it["fid"], "name": it["file_name"], "dir": bool(it.get("dir")),
                "size": it.get("size") or 0, "path": path, "depth": depth + 1,
            }
            tree.append(node)
            if node["dir"] and depth < 6:
                queue.append((it["fid"], path, depth + 1))
        time.sleep(0.12)
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(tree, ensure_ascii=False, indent=1), encoding="utf-8")
    dirs = [n for n in tree if n["dir"]]
    files = [n for n in tree if not n["dir"]]
    print(f"dirs={len(dirs)} files={len(files)} saved={OUT}")
    for n in dirs[:80]:
        print("  " * n["depth"] + "D " + n["name"])


if __name__ == "__main__":
    main()
