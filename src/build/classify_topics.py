# -*- coding: utf-8 -*-
"""Tag imported math questions with a topic chapter (math-01..math-20)."""
import json, glob, os, re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
RULES = [
    ("math-01", ["极限", "连续", "无穷小", "等价无穷小", "渐近线", "间断点", "数列极限", "夹逼"]),
    ("math-02", ["导数", "可导", "微分", "极值", "拐点", "中值定理", "泰勒", "单调", "曲率", "洛必达"]),
    ("math-03", ["不定积分", "定积分", "原函数", "反常积分", "换元积分", "分部积分", "旋转体", "弧长", "形心"]),
    ("math-04", ["向量代数", "数量积", "向量积", "混合积", "平面方程", "直线方程", "点到平面", "柱面", "旋转曲面", "空间曲线"]),
    ("math-05", ["偏导", "全微分", "方向导数", "梯度", "拉格朗日乘", "多元函数", "隐函数", "二元函数"]),
    ("math-06", ["二重积分", "三重积分", "曲线积分", "曲面积分", "格林公式", "高斯公式", "斯托克斯", "通量", "散度", "旋度", "重积分"]),
    ("math-07", ["级数", "收敛半径", "幂级数", "傅里叶", "和函数", "绝对收敛", "条件收敛", "收敛域"]),
    ("math-08", ["微分方程", "通解", "特解", "初值问题", "齐次方程", "伯努利", "积分因子"]),
    ("math-09", ["行列式", "代数余子式", "范德蒙"]),
    ("math-10", ["逆矩阵", "伴随矩阵", "矩阵方程", "矩阵的秩", "分块矩阵", "初等变换", "矩阵乘法", "可逆矩阵"]),
    ("math-11", ["向量组", "线性相关", "线性无关", "线性表示", "基础解系", "方程组", "极大无关组"]),
    ("math-12", ["特征值", "特征向量", "相似对角化", "相似矩阵", "可对角化"]),
    ("math-13", ["二次型", "正惯性指数", "合同", "正交变换", "标准形", "规范形"]),
    ("math-14", ["随机事件", "条件概率", "全概率", "贝叶斯", "古典概型", "事件运算", "相互独立"]),
    ("math-16", ["二维随机变量", "联合分布", "边缘分布", "条件分布", "二维正态"]),
    ("math-17", ["数学期望", "方差", "协方差", "相关系数", "数字特征", "原点矩", "中心矩"]),
    ("math-18", ["大数定律", "中心极限定理", "切比雪夫不等式"]),
    ("math-19", ["样本", "统计量", "抽样分布", "卡方分布", "t分布", "F分布", "经验分布"]),
    ("math-20", ["参数估计", "矩估计", "最大似然", "极大似然", "无偏估计", "置信区间", "假设检验", "拒绝域", "显著性", "检验统计量"]),
    ("math-15", ["随机变量", "概率密度", "分布函数", "均匀分布", "指数分布", "正态分布", "泊松分布", "二项分布", "几何分布"]),
]
TITLES = {
    "math-01": "函数、极限与连续", "math-02": "一元函数微分学", "math-03": "一元函数积分学",
    "math-04": "向量代数与空间解析几何", "math-05": "多元函数微分学", "math-06": "多元函数积分学",
    "math-07": "无穷级数", "math-08": "常微分方程", "math-09": "行列式", "math-10": "矩阵及其运算",
    "math-11": "向量组与线性方程组", "math-12": "特征值与特征向量", "math-13": "二次型",
    "math-14": "随机事件与概率", "math-15": "一维随机变量及其分布", "math-16": "多维随机变量及其分布",
    "math-17": "随机变量的数字特征", "math-18": "大数定律与中心极限定理",
    "math-19": "数理统计基本概念与抽样分布", "math-20": "参数估计与假设检验",
}


def rule_match(s):
    # 线性代数优先
    if any(k in s for k in ["二次型", "惯性指数", "合同", "规范形"]):
        return "math-13"
    if any(k in s for k in ["特征值", "特征向量", "相似对角", "可对角化", "相似于"]):
        return "math-12"
    if any(k in s for k in ["向量组", "线性相关", "线性无关", "线性表示", "基础解系", "极大无关组"]):
        return "math-11"
    if "行列式" in s or "代数余子式" in s:
        return "math-09"
    if any(k in s for k in ["矩阵", "逆矩阵", "伴随矩阵", "矩阵方程", "可逆矩阵", "初等变换", "分块"]):
        return "math-10"
    # 概率统计
    if any(k in s for k in ["假设检验", "拒绝域", "显著性", "置信区间", "最大似然", "极大似然", "矩估计", "无偏估计", "参数估计"]):
        return "math-20"
    if any(k in s for k in ["样本", "统计量", "抽样分布", "卡方分布", "t分布", "F分布", "经验分布"]):
        return "math-19"
    if any(k in s for k in ["大数定律", "中心极限", "切比雪夫不等式"]):
        return "math-18"
    if any(k in s for k in ["数学期望", "方差", "协方差", "相关系数", "数字特征"]):
        return "math-17"
    if any(k in s for k in ["二维随机变量", "联合分布", "边缘分布", "条件分布", "二维正态"]) or (
            re.search(r"[XY]\s*[,，]\s*[YZ]", s) and "分布" in s):
        return "math-16"
    if any(k in s for k in ["随机变量", "概率密度", "分布函数", "分布律", "正态分布", "均匀分布", "指数分布", "泊松分布", "二项分布"]):
        return "math-15"
    if any(k in s for k in ["随机事件", "条件概率", "全概率", "贝叶斯", "古典概型", "相互独立", "事件"]):
        return "math-14"
    # 高等数学
    if any(k in s for k in ["二重积分", "三重积分", "曲线积分", "曲面积分", "重积分", "格林公式", "高斯公式", "斯托克斯", "通量", "散度", "旋度"]):
        return "math-06"
    if any(k in s for k in ["级数", "收敛半径", "幂级数", "傅里叶", "和函数", "收敛域"]):
        return "math-07"
    if any(k in s for k in ["微分方程", "通解", "特解", "初值", "齐次方程", "伯努利", "积分因子"]):
        return "math-08"
    if any(k in s for k in ["向量代数", "数量积", "向量积", "混合积", "平面方程", "直线方程", "点到平面", "柱面", "旋转曲面", "空间曲线"]):
        return "math-04"
    if any(k in s for k in ["偏导", "全微分", "方向导数", "梯度", "多元函数", "隐函数", "二元函数"]):
        return "math-05"
    if any(k in s for k in ["积分", "原函数", "旋转体", "弧长", "形心"]):
        return "math-03"
    if any(k in s for k in ["导数", "可导", "微分", "极值", "拐点", "中值定理", "泰勒", "单调", "曲率", "罗尔", "拉格朗日", "柯西"]):
        return "math-02"
    if any(k in s for k in ["极限", "连续", "无穷小", "渐近线", "间断点", "夹逼"]):
        return "math-01"
    return None


def classify(it):
    cid = rule_match(it.get("text") or "")
    if cid:
        return cid
    cid = rule_match(" ".join(it.get("steps") or []) + " " + (it.get("answer") or ""))
    return cid or "math-01"


def main():
    files = sorted(glob.glob(str(ROOT / "src/bank/imported-math-*.json")) +
                   glob.glob(str(ROOT / "src/bank/imported-mock-*.json")))
    dist = {}
    for f in files:
        data = json.loads(Path(f).read_text(encoding="utf-8"))
        for it in data.get("items", []):
            cid = classify(it)
            it["topicChapter"] = cid
            it["topicTitle"] = TITLES[cid]
            dist[cid] = dist.get(cid, 0) + 1
        Path(f).write_text(json.dumps(data, ensure_ascii=False, indent=1), encoding="utf-8")
    print("files", len(files), "tagged", sum(dist.values()))
    for k in sorted(dist):
        print(k, TITLES[k], dist[k])


if __name__ == "__main__":
    main()
