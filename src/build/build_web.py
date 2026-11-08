# -*- coding: utf-8 -*-
"""Build per-chapter web reading bundles (lazy-loaded by the atlas)."""
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "src" / "build"))
import render  # noqa: E402

SUBJECTS = {
    "math": ("数学一", "#1F3A5F", "#E7ECF3"),
    "english": ("英语一", "#5B3A6B", "#EEE8F2"),
    "mechanics": ("807 材料力学", "#8A4B2A", "#F2E9E1"),
    "politics": ("政治", "#A02C2C", "#F5E6E3"),
}
MARKER = re.compile(r"\[\[[KTS]-[^\]]+\]\]")


def strip_markers(html):
    return MARKER.sub("", html)


def main():
    out_dir = ROOT / "web"
    out_dir.mkdir(exist_ok=True)
    count = 0
    for sid in SUBJECTS:
        files = sorted((ROOT / "src" / "chapters" / sid).glob("*.json"))
        chapters = []
        for f in files:
            try:
                ch = json.loads(f.read_text(encoding="utf-8"))
            except Exception as exc:
                print(f"  ! skip {f.name}: {exc}")
                continue
            chapters.append((f.stem, ch))

        body = [c for c in chapters if c[0] != "00"]
        for i, (no, ch) in enumerate(chapters):
            pos = next((j for j, (n, _) in enumerate(body) if n == no), -1)
            prev = body[pos - 1][1] if pos > 0 else (body[0][1] if no == "00" and body else None)
            nxt = body[pos + 1][1] if 0 <= pos < len(body) - 1 else (body[0][1] if no == "00" and body else None)
            name, accent, soft = SUBJECTS[sid]
            payload = {
                "id": ch["id"],
                "subject": sid,
                "subjectName": name,
                "accent": accent,
                "soft": soft,
                "code": ch.get("code", ""),
                "title": ch["title"],
                "subtitle": ch.get("subtitle", ""),
                "priority": ch.get("priority", ""),
                "meta": ch.get("meta", []),
                "pdf": f"pdf/{ch['id']}.pdf",
                "html": strip_markers(render.build_fragment(ch, web=True)),
                "toc": [
                    {"id": kp.get("id") or f"kp-{j:02d}", "no": f"{j:02d}", "name": kp["name"],
                     "freq": kp.get("freq", "")}
                    for j, kp in enumerate(ch.get("kps", []), 1)
                ],
                "topics": [
                    {"id": tp.get("id") or f"topic-{j:02d}", "no": f"{j:02d}", "name": tp["name"]}
                    for j, tp in enumerate(ch.get("topics", []), 1)
                ],
                "hasSummary": bool(ch.get("summary")),
                "prev": {"id": prev["id"], "title": prev["title"]} if prev else None,
                "next": {"id": nxt["id"], "title": nxt["title"]} if nxt else None,
            }
            text = "window.ATLAS_CH=window.ATLAS_CH||{};window.ATLAS_CH[" + json.dumps(ch["id"]) + "]=" + \
                   json.dumps(payload, ensure_ascii=False, separators=(",", ":")) + ";\n"
            (out_dir / f"{ch['id']}.js").write_text(text, encoding="utf-8")
            count += 1
    total = sum((out_dir / f.name).stat().st_size for f in out_dir.glob("*.js"))
    print(f"built {count} chapter bundles, {total/1e6:.2f} MB")


if __name__ == "__main__":
    main()
