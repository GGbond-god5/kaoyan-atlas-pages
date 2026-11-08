# -*- coding: utf-8 -*-
"""Classify downloaded bank PDFs into a hardlink view and a catalog.

Original tree is untouched; hardlinks cost no extra space on the same volume.
"""
import json
import os
import re
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
BANK = ROOT / "bank"
SURVEY = ROOT / "src" / "bank" / "pdf-survey.json"
VIEW = BANK / "_分类"
CATALOG = ROOT / "src" / "bank" / "catalog.json"
JS = ROOT / "assets" / "bank-catalog.js"

TEACHERS = ["李林", "张宇", "合工大超越", "合工大共创", "李永乐", "武忠祥", "汤家凤", "方浩",
            "姜晓千", "李擂", "李良", "李艳芳", "欧几里得", "kira", "余丙森", "小侯七",
            "肖秀荣", "肖1000", "肖八", "肖四", "腿姐", "徐涛", "米鹏", "曲艺", "张修齐",
            "石雷鹏", "王江涛", "唐迟", "田静", "唐静", "周思成", "潘赟", "颉斌斌", "刘晓艳", "刘晓燕"]


def subject_of(p: str):
    s = p.lower()
    if any(k in s for k in ["mech-zhenti", "mech-330", "mech-zhang", "材料力学", "807",
                            "801", "机械", "结构力学"]):
        return "807材料力学"
    if any(k in s for k in ["eng-zhenti", "eng-writing", "英语", "英一", "英二", "词汇", "单词",
                            "作文", "阅读", "翻译", "长难句", "完型", "完形", "新题型", "石雷鹏",
                            "唐迟", "田静", "王江涛", "周思成", "潘赟", "颉斌斌", "刘晓艳", "刘晓燕",
                            "恋练有词", "红宝书", "黄皮书", "考研真相"]):
        return "英语一"
    if any(k in s for k in ["pol-zhenti", "pol-xiao", "政治", "肖秀荣", "肖1000", "肖八", "肖四",
                            "腿姐", "徐涛", "米鹏", "曲艺", "张修齐", "韩雪", "苏一", "大李子",
                            "核心考案", "精讲精练"]):
        return "政治"
    return "数学一"


def type_of(p: str):
    s = p.lower()
    for key, val in [("00.考研数学", "真题"), ("eng-zhenti", "真题"), ("pol-zhenti", "真题"),
                     ("mech-zhenti", "真题"), ("math-zhenti", "真题"),
                     ("pol-xiao1000", "习题"), ("pol-xiao8", "模拟题"), ("pol-xiao4", "模拟题"),
                     ("math-lin6", "模拟题"), ("math-zhang4", "模拟题"), ("math-hefei", "模拟题"),
                     ("mech-330", "习题"), ("mech-zhang", "讲义"), ("eng-writing", "词汇作文")]:
        if key in p:
            if val == "真题":
                return "真题", "解析" if any(k in s for k in ["解析", "答案"]) else "试卷"
            return val, ""
    if any(k in s for k in ["习题", "题库", "1000题", "880", "660", "330", "220", "刷题"]):
        return "习题", ""
    if any(k in s for k in ["词汇", "单词", "作文", "句式", "长难句", "翻译", "背诵20篇"]):
        return "词汇作文", ""
    if any(k in s for k in ["讲义", "精讲", "强化", "基础", "笔记", "背诵", "思维导图",
                            "公式", "手册", "教程", "课程", "辅导", "考点", "必背"]):
        return "讲义", ""
    if any(k in s for k in ["模拟", "模考", "套卷", "预测", "超越", "共创", "押题", "八套",
                            "四套", "六套", "5+5", "研过"]):
        return "模拟题", "套卷"
    if "真题" in s and not any(k in s for k in ["模拟", "预测", "押题"]):
        return "真题", "解析" if any(k in s for k in ["解析", "答案"]) else "试卷"
    return "其他", ""


def source_of(p: str):
    for t in TEACHERS:
        if t.lower() in p.lower():
            return t
    top = p.split("/")[0]
    for key, val in [("00.考研数学", "历年真题"), ("eng-zhenti", "英语真题"),
                     ("pol-zhenti", "政治真题"), ("mech-zhenti", "807真题"),
                     ("math-hefei", "合工大"), ("math-lin6", "李林"),
                     ("math-zhang4", "张宇"), ("mech-330", "瞌睡哥"),
                     ("mech-zhang", "张晓晴教材"), ("eng-writing", "作文"),
                     ("pol-xiao1000", "肖秀荣"), ("pol-xiao8", "肖八"), ("pol-xiao4", "肖四")]:
        if key in p:
            return val
    return top if top else "其他"


def safe(name: str, used: set):
    name = re.sub(r'[\\/:*?"<>|]', "_", name).strip(" .")
    if not name:
        name = "file.pdf"
    base = name
    i = 2
    while name.lower() in used:
        stem = Path(base).stem
        name = f"{stem}__{i}.pdf"
        i += 1
    used.add(name.lower())
    return name


def main():
    rows = json.loads(SURVEY.read_text(encoding="utf-8"))
    catalog = []
    seen_dest = set()
    made = 0
    for r in rows:
        if "error" in r or not r["path"].lower().endswith(".pdf"):
            continue
        p = r["path"]
        subject = subject_of(p)
        typ, subtype = type_of(p)
        source = source_of(p)
        dest_dir = VIEW / typ / subject / source
        dest = dest_dir / safe(Path(p).name, seen_dest)
        dest_dir.mkdir(parents=True, exist_ok=True)
        src = BANK / p
        try:
            if not dest.exists():
                os.link(src, dest)
                made += 1
        except Exception as e:
            dest = src  # fallback to original path
        catalog.append({
            "type": typ, "subtype": subtype, "subject": subject, "source": source,
            "kind": r["kind"], "pages": r["pages"], "size": r["size"],
            "path": p, "view": dest.relative_to(BANK).as_posix(),
            "title": r.get("title", ""), "snippet": r.get("snippet", ""),
        })

    CATALOG.write_text(json.dumps(catalog, ensure_ascii=False, indent=1), encoding="utf-8")
    JS.write_text("window.BANK_CATALOG=" + json.dumps(catalog, ensure_ascii=False, separators=(",", ":")) + ";\n",
                  encoding="utf-8")
    (VIEW / "说明.txt").write_text(
        "这是按类型/科目/来源建立的硬链接视图，不占额外空间；原文件仍在 bank/ 原目录。\n"
        "真题：真题/<科目>/<来源>/；模拟题：模拟题/<科目>/<来源>/；讲义、词汇作文、习题各自分类。\n",
        encoding="utf-8")
    print("catalog", len(catalog), "hardlinks", made)
    print("types", Counter((c["type"], c["subject"]) for c in catalog).most_common(20))


if __name__ == "__main__":
    main()
