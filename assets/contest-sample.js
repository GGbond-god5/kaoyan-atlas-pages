/* 参赛版「AI 批改样例」数据（仅 --contest 构建打包进页面，正式版不加载）。
 * TODO（站长，11 月 27 日前）：把下面两份替换为正式版的真实批改结果——
 *   1) 在主站做一份带解答题的数学卷、交卷等批改完成；
 *   2) 写一篇英语大作文交卷批改；
 * 把结果页的分数、维度、点评（作文另有 grammar/upgrades/revised）照字段填进来，
 * 最后把 placeholder 改为 false。字段口径与正式版批改详情保持一致。 */
window.CONTEST_SAMPLE = {
  placeholder: true,
  math: {
    title: "数学一 · 解答题批改样例",
    question: "（待替换：样例题干）",
    answer: "（待替换：学生作答——正式版为拍照上传的手写解答照片）",
    score: 0,
    maxScore: 10,
    dimensions: [
      { name: "概念", score: 0, max: 0, comment: "待替换" },
      { name: "方法", score: 0, max: 0, comment: "待替换" },
      { name: "计算", score: 0, max: 0, comment: "待替换" },
      { name: "审题", score: 0, max: 0, comment: "待替换" },
      { name: "规范", score: 0, max: 0, comment: "待替换" },
      { name: "综合", score: 0, max: 0, comment: "待替换" }
    ],
    comments: ["待替换为真实批改点评（逐步给分与丢分点）"]
  },
  essay: {
    title: "英语一 · 大作文批改样例",
    question: "（待替换：作文题目与题图说明）",
    answer: "（待替换：学生作文原文）",
    score: 0,
    maxScore: 20,
    dimensions: [
      { name: "内容切题", score: 0, max: 0, comment: "待替换" },
      { name: "语言表达", score: 0, max: 0, comment: "待替换" },
      { name: "篇章结构", score: 0, max: 0, comment: "待替换" },
      { name: "书写规范", score: 0, max: 0, comment: "待替换" }
    ],
    comments: ["待替换为真实批改点评"],
    grammar: [
      { wrong: "（待替换：原句错误片段）", right: "（改后）", note: "（说明）" }
    ],
    upgrades: [
      { from: "（待替换：平淡表达）", to: "（升级表达）" }
    ],
    revised: "（待替换：改写范文）"
  }
};
