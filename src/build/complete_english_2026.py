"""Complete the local 2026 English papers from the user's original PDFs.

The first 40 questions must already have been transcribed. Uses AI_API_KEY for
translation and writing drafts, which remain explicitly marked for review.
"""
import json
import os
import re
from pathlib import Path

import pymupdf
from review_questions import call_ai

ROOT = Path(__file__).resolve().parents[2]
BANK = ROOT.parent / "kaoyan-atlas" / "bank" / "eng-zhenti"
PAGES = ROOT / "content/new-subjects"


def compact(text):
    return " ".join(re.sub(r"https://\S+", "", text).split())


def item(kind, number, question_kind, text, passage, page, score, topic):
    label = "一" if kind == "eng" else "二"
    return {
        "id": f"{kind}-2026-{number}",
        "subject": "english" if kind == "eng" else "english2",
        "chapter": f"{kind}-2026",
        "chapterTitle": f"英语{label} 2026 真题",
        "kp": "",
        "kpName": f"第{number}题（{question_kind}）",
        "kind": question_kind,
        "difficulty": "中",
        "year": "2026",
        "source": f"2026 年全国硕士研究生招生考试 英语（{label}）",
        "isReal": True,
        "isMock": False,
        "text": text,
        "passage": passage,
        "answer": "",
        "steps": [],
        "maxScore": score,
        "sourcePdf": f"bank/eng-zhenti/2026年考研英语{label}.pdf",
        "sourcePage": page,
        "pageImage": f"content/new-subjects/{kind}-2026-p{page}.png",
        "topicChapter": topic,
        "reviewStatus": "needs_review",
        "reviewReason": "从用户提供的原卷提取，答案和解析待逐题复核。",
    }


def section_options(text, letters):
    markers = list(re.finditer(r"(?m)^\s*([A-H])\.\s*", text))
    output = {}
    for index, marker in enumerate(markers):
        end = markers[index + 1].start() if index + 1 < len(markers) else len(text)
        segment = text[marker.end():end]
        segment = re.split(r"\n\s*4[1-5]\.\s*", segment)[0]
        output[marker.group(1)] = compact(segment)
    if not all(letter in output for letter in letters):
        raise ValueError("新题型选项抽取不完整")
    return output


def generate_drafts(questions):
    payload = [{"id": q["id"], "kind": q["kind"], "question": q["text"], "passage": q["passage"]} for q in questions]
    system = (
        "你是考研英语阅卷教师。仅根据所给的原卷题目生成参考内容。翻译须完整忠实，"
        "作文须符合题目、字数和署名要求。图表数值必须以题目所给数据为准，不得虚构事实。"
        "每题给出答案和具体解析步骤。只输出JSON对象items，数组成员为"
        "{id,answer,steps:[字符串]}，不得漏题。"
    )
    result, _ = call_ai(system, [{"type": "text", "text": json.dumps(payload, ensure_ascii=False)}], os.environ.get("AI_MODEL", "qwen3-vl-plus"))
    by_id = {value.get("id"): value for value in result.get("items", [])}
    if set(by_id) != {q["id"] for q in questions}:
        raise ValueError("主观题参考内容不完整")
    for question in questions:
        generated = by_id[question["id"]]
        if not isinstance(generated.get("answer"), str) or not isinstance(generated.get("steps"), list):
            raise ValueError("主观题参考内容格式无效")
        question["answer"] = generated["answer"]
        question["steps"] = generated["steps"]
        question["reviewReason"] = "原卷文字层提取；参考译文或范文由 AI 生成，待人工复核。"


def complete(kind):
    label = "一" if kind == "eng" else "二"
    path = ROOT / "src/bank" / f"imported-{kind}-2026.json"
    data = json.loads(path.read_text(encoding="utf8"))
    if len(data["items"]) > 40:
        raise ValueError(f"{path.name} 已含后续题目；为保护人工校核结果，禁止覆盖。")
    existing = data["items"][:40]
    if len(existing) != 40 or [q["id"] for q in existing] != [f"{kind}-2026-{n}" for n in range(1, 41)]:
        raise ValueError("前 40 题不完整或顺序异常")
    with pymupdf.open(BANK / f"2026年考研英语{label}.pdf") as doc:
        pages = [page.get_text() for page in doc]
        PAGES.mkdir(parents=True, exist_ok=True)
        for number in range(11, 15):
            doc[number - 1].get_pixmap(matrix=pymupdf.Matrix(1.25, 1.25)).save(PAGES / f"{kind}-2026-p{number}.png")
    options = section_options(pages[10] + "\n" + pages[11], "ABCDEFGH" if kind == "eng" else "ABCDEFG")
    extra = []
    if kind == "eng":
        passage = "原卷给定顺序：F → 41 → 42 → H → 43 → C → 44 → 45。\n" + "\n".join(f"{letter}. {options[letter]}" for letter in "FHC")
        choices = "\n".join(f"{letter}. {options[letter]}" for letter in "ABDEG")
        answers = "BEAGD"
        reasons = ["B 中 this 指代 F 段阅读建议，But 转向商界现状。", "E 介绍科普阅读，后接 H 的小说阅读建议。", "A 建议阅读诗歌，其结尾强调阅读益处，衔接 C 的科学解释。", "G 用 also 接续 C 段已经列出的阅读益处。", "D 总结阅读的益处并以建议结尾。"]
        for index in range(5):
            q = item(kind, 41 + index, "新题型", f"为第 {41 + index} 处选择合适段落。\n{choices}", passage, 12, 2, "english-04")
            q["answer"], q["steps"] = answers[index], [reasons[index]]
            extra.append(q)
        translated = compact(pages[12])
        for number in range(46, 51):
            match = re.search(r"\(" + str(number) + r"\)\s*(.*?\.)(?=\s|$)", translated)
            if not match:
                raise ValueError(f"翻译第 {number} 题抽取失败")
            extra.append(item(kind, number, "翻译", "请将下列句子译成中文。\n" + match.group(1), "", 13, 2, "english-05"))
        first = pages[13].split("51. Directions:", 1)[1].split("Part  B", 1)[0]
        mail = pages[13].split("Hi  Li  Ming,", 1)[1]
        extra.append(item(kind, 51, "小作文", compact(first) + "\nHi Li Ming, " + compact(mail), "", 14, 10, "english-06"))
        chart = "消费者对养老机器人的接受度：不接受 27.9%，部分接受 32.8%，完全接受 39.3%；首要关注点：安全 46.3%，价格 24.9%，便利 10.7%。"
        extra.append(item(kind, 52, "大作文", "根据原卷中的调查图表写一篇 160–200 词的英语作文，描述并解释图表，给出评论。\n" + chart, "", 14, 20, "english-07"))
    else:
        passage = compact(pages[10].split("(10  points)", 1)[-1] + " " + pages[11].split("A.", 1)[0])
        choices = "\n".join(f"{letter}. {options[letter]}" for letter in "ABCDEFG")
        names = ["Ramni Jamnadass", "Christopher Kettle", "John Stanturf", "Pedro Brancalion", "Robin Chazdon"]
        answers = "EAGCD"
        reasons = ["Jamnadass 将种子与种苗供应称为恢复工作的瓶颈，对应 E。", "Kettle 提到间歇结实树种不会每年产生种子，对应 A。", "Stanturf 指出某些昆虫繁殖增加后可能成为严重问题，对应 G。", "Brancalion 对比资金方关注气候变化和农民关注水资源，说明实际需要可能不同，对应 C。", "Chazdon 强调恢复工作与人及其行动有关，对应 D。"]
        for index, name in enumerate(names):
            q = item(kind, 41 + index, "新题型", f"将 {name} 的观点与选项匹配。\n{choices}", passage, 12, 2, "english-04")
            q["answer"], q["steps"] = answers[index], [reasons[index]]
            extra.append(q)
        translation = compact(pages[12].split("(15", 1)[1].split("points)", 1)[1])
        extra.append(item(kind, 46, "翻译", "请将下列英文段落译成中文。\n" + translation, "", 13, 15, "english-05"))
        first = pages[13].split("47. Directions:", 1)[1].split("Part  B", 1)[0]
        extra.append(item(kind, 47, "小作文", compact(first), "", 14, 10, "english-06"))
        chart = "儿童户外活动的作用：满足好奇心 54.6%，促进观察力 54.5%，强身健体 37.2%，增强亲子互动 33.2%。"
        extra.append(item(kind, 48, "大作文", "根据原卷中的调查图表写一篇约 150 词的英语作文，描述并解释图表，给出评论。\n" + chart, "", 14, 15, "english-07"))
        question = existing[25]
        question["answer"] = "B"
        question["steps"] = ["第一段指出，与 AI 交流会让人感到被倾听且不那么孤独，对应 B 项的情感支持。", "A 的职业晋升、C 的维持动机与 D 的职场交流均非该句直接表达。"]
        question["reviewReason"] = "原文直接证据与两份公开参考一致，修正原 AI 草稿误选 C。"
        question["reviewStatus"] = "source_checked"
        existing[29]["reviewReason"] = "第 30 题不同参考资料存在 A 与 D 的分歧，待进一步核对官方依据。"
        existing[29]["reviewStatus"] = "needs_review"
    subjective = [q for q in extra if q["kind"] in ("翻译", "小作文", "大作文")]
    generate_drafts(subjective)
    data["items"] = existing + extra
    path.write_text(json.dumps(data, ensure_ascii=False, indent=1) + "\n", encoding="utf8")
    print(f"{path.name}: {len(data['items'])} questions", flush=True)


if __name__ == "__main__":
    complete("eng")
    complete("eng2")
