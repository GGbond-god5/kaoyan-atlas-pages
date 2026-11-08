# -*- coding: utf-8 -*-
"""Assign topicChapter/topicTitle to paper items (politics / english / mechanics)."""
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
BANK = ROOT / "src" / "bank"

POL = [
    ("pol-05", "中国近现代史纲要", ["辛亥", "抗日", "长征", "五四", "鸦片", "甲午", "洋务", "维新", "太平天国",
                                "近代中国", "新民主主义革命", "中国共产党成立", "延安", "解放战争", "抗战",
                                "戊戌", "义和团", "八七会议", "遵义会议", "十一届三中全会", "改革开放",
                                "中华人民共和国成立", "社会主义改造", "一五计划", "大跃进"]),
    ("pol-06", "思想道德与法治", ["道德", "法律", "法治", "宪法", "人生观", "价值观", "理想信念", "爱国主义",
                              "社会公德", "职业道德", "家庭美德", "诚信", "权利", "义务", "精神", "社会主义核心价值观"]),
    ("pol-04", "习近平新时代中国特色社会主义思想", ["习近平", "新时代", "中国式现代化", "新质生产力", "十五五",
                                              "人类命运共同体", "全过程人民民主", "共同富裕", "高质量发展",
                                              "新发展理念", "一带一路", "全面深化改革", "总体国家安全观",
                                              "生态文明", "乡村振兴", "两个结合", "六个必须坚持"]),
    ("pol-02", "马克思主义政治经济学与科学社会主义", ["剩余价值", "资本", "商品", "货币", "垄断", "经济全球化",
                                            "科学社会主义", "空想社会主义", "共产主义", "生产资料", "利润率",
                                            "资本积累", "帝国主义", "金融资本", "劳动价值"]),
    ("pol-03", "毛泽东思想和中国特色社会主义理论体系", ["毛泽东", "邓小平", "三个代表", "科学发展观", "社会主义初级阶段",
                                              "社会主义市场经济", "实事求是", "群众路线", "统一战线", "党的建设",
                                              "新民主主义论", "论十大关系", "南方谈话"]),
    ("pol-01", "马克思主义基本原理（哲学）", ["唯物", "唯心", "辩证", "矛盾", "实践", "认识", "真理", "规律",
                                      "意识", "物质", "联系", "发展", "量变", "质变", "否定之否定",
                                      "历史唯物主义", "生产力", "生产关系", "上层建筑", "社会存在",
                                      "社会意识", "人民群众", "自由", "必然"]),
]

ENG = {
    "完形": ("english-02", "完形填空"),
    "阅读": ("english-03", "阅读理解 Part A"),
    "新题型": ("english-04", "新题型 Part B"),
    "翻译": ("english-05", "翻译 Part C"),
    "小作文": ("english-06", "小作文"),
    "大作文": ("english-07", "大作文"),
}

MECH = [
    ("mech-09", "压杆稳定", ["稳定", "欧拉", "临界力", "柔度", "失稳"]),
    ("mech-10", "能量法", ["能量法", "卡氏", "单位载荷", "莫尔积分", "应变能", "虚功"]),
    ("mech-11", "动载荷与冲击", ["冲击", "动载", "动荷", "自由落体", "加速度", "惯性力"]),
    ("mech-13", "连接件的剪切与挤压", ["挤压", "剪切", "铆钉", "螺栓", "焊缝"]),
    ("mech-07", "应力状态与强度理论", ["应力状态", "主应力", "强度理论", "莫尔圆", "最大切应力"]),
    ("mech-08", "组合变形", ["组合变形", "偏心", "弯扭", "拉弯", "斜弯曲"]),
    ("mech-03", "扭转", ["扭转", "扭矩", "剪应力", "极惯性矩", "抗扭"]),
    ("mech-06", "弯曲变形", ["挠度", "转角", "弯曲变形", "叠加法", "积分法"]),
    ("mech-05", "弯曲应力", ["弯曲应力", "正应力", "抗弯截面", "中性轴"]),
    ("mech-04", "弯曲内力", ["弯矩", "剪力", "剪力图", "弯矩图", "梁"]),
    ("mech-02", "轴向拉压", ["拉压", "拉伸", "压缩", "轴力", "胡克定律", "纵向变形"]),
    ("mech-12", "平面图形的几何性质", ["形心", "惯性矩", "静矩", "平行移轴", "几何性质"]),
    ("mech-14", "电测应力分析与实验", ["电测", "应变片", "桥路", "实验"]),
    ("mech-01", "绪论与力学简图", ["约束", "受力图", "简图", "支座", "静定"]),
]


def pick(rules, text, default):
    best, best_n = None, 0
    for cid, title, kws in rules:
        n = sum(1 for k in kws if k in text)
        if n > best_n:
            best, best_n = (cid, title), n
    return best or default


def main():
    seen = set()
    for f in sorted(BANK.glob("imported-*.json")):
        data = json.loads(f.read_text(encoding="utf-8"))
        items = data.get("items", [])
        changed = 0
        for it in items:
            ch = it.get("chapter", "")
            if not re.search(r"\d{4}", ch):
                continue
            subj = it.get("subject")
            if subj == "english":
                m = ENG.get(it.get("kind"))
                if m:
                    it["topicChapter"], it["topicTitle"] = m
                    changed += 1
            elif subj == "politics":
                text = (it.get("text", "") + " " + " ".join(it.get("steps", [])))
                cid, title = pick(POL, text, ("pol-01", "马克思主义基本原理（哲学）"))
                it["topicChapter"], it["topicTitle"] = cid, title
                changed += 1
            elif subj == "mechanics":
                text = it.get("text", "")
                cid, title = pick(MECH, text, ("mech-01", "绪论与力学简图"))
                it["topicChapter"], it["topicTitle"] = cid, title
                changed += 1
        if changed:
            f.write_text(json.dumps(data, ensure_ascii=False, indent=1), encoding="utf-8")
            print(f.name, changed)
            seen.add(subj)


if __name__ == "__main__":
    main()
