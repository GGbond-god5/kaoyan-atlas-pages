// 共享院校专业目录（示例起步库，正式报考请以招生简章为准）。
// 仅收录能确认的公共课组合；专业课不确定时留空，由用户在档案里补充。
export const PROGRAMS = [
  {
    id: "scut-085500",
    school: "华南理工大学",
    college: "机械与汽车工程学院",
    majorCode: "085500",
    majorName: "机械",
    degreeType: "专业学位",
    studyMode: "全日制",
    year: 2027,
    note: "专业课以当年招生简章为准",
    subjects: [
      { kind: "math", variant: "math1", name: "数学一", code: "301", fullScore: 150 },
      { kind: "english", variant: "english1", name: "英语一", code: "201", fullScore: 100 },
      { kind: "politics", name: "思想政治理论", code: "101", fullScore: 100 },
      { kind: "professional", name: "807 材料力学", code: "807", fullScore: 150, builtin: "mechanics" },
    ],
  },
  {
    id: "scut-080200",
    school: "华南理工大学",
    college: "机械与汽车工程学院",
    majorCode: "080200",
    majorName: "机械工程",
    degreeType: "学术学位",
    studyMode: "全日制",
    year: 2027,
    note: "专业课以当年招生简章为准",
    subjects: [
      { kind: "math", variant: "math1", name: "数学一", code: "301", fullScore: 150 },
      { kind: "english", variant: "english1", name: "英语一", code: "201", fullScore: 100 },
      { kind: "politics", name: "思想政治理论", code: "101", fullScore: 100 },
      { kind: "professional", name: "807 材料力学", code: "807", fullScore: 150, builtin: "mechanics" },
    ],
  },
  {
    id: "scut-085400",
    school: "华南理工大学",
    college: "电子与信息学院",
    majorCode: "085400",
    majorName: "电子信息",
    degreeType: "专业学位",
    studyMode: "全日制",
    year: 2027,
    note: "专业课按方向不同，请在档案里补充名称与代码",
    subjects: [
      { kind: "math", variant: "math1", name: "数学一", code: "301", fullScore: 150 },
      { kind: "english", variant: "english1", name: "英语一", code: "201", fullScore: 100 },
      { kind: "politics", name: "思想政治理论", code: "101", fullScore: 100 },
    ],
  },
  {
    id: "sysu-085400",
    school: "中山大学",
    college: "电子与信息工程学院",
    majorCode: "085400",
    majorName: "电子信息",
    degreeType: "专业学位",
    studyMode: "全日制",
    year: 2027,
    note: "专业课按方向不同，请在档案里补充名称与代码",
    subjects: [
      { kind: "math", variant: "math1", name: "数学一", code: "301", fullScore: 150 },
      { kind: "english", variant: "english1", name: "英语一", code: "201", fullScore: 100 },
      { kind: "politics", name: "思想政治理论", code: "101", fullScore: 100 },
    ],
  },
  {
    id: "hust-085500",
    school: "华中科技大学",
    college: "机械科学与工程学院",
    majorCode: "085500",
    majorName: "机械",
    degreeType: "专业学位",
    studyMode: "全日制",
    year: 2027,
    note: "专业课请以简章为准并在档案里补充",
    subjects: [
      { kind: "math", variant: "math1", name: "数学一", code: "301", fullScore: 150 },
      { kind: "english", variant: "english1", name: "英语一", code: "201", fullScore: 100 },
      { kind: "politics", name: "思想政治理论", code: "101", fullScore: 100 },
    ],
  },
  {
    id: "xjtu-085500",
    school: "西安交通大学",
    college: "机械工程学院",
    majorCode: "085500",
    majorName: "机械",
    degreeType: "专业学位",
    studyMode: "全日制",
    year: 2027,
    note: "专业课请以简章为准并在档案里补充",
    subjects: [
      { kind: "math", variant: "math1", name: "数学一", code: "301", fullScore: 150 },
      { kind: "english", variant: "english1", name: "英语一", code: "201", fullScore: 100 },
      { kind: "politics", name: "思想政治理论", code: "101", fullScore: 100 },
    ],
  },
];

export function searchPrograms(query, limit = 20) {
  const q = String(query || "").trim().toLowerCase();
  const list = q
    ? PROGRAMS.filter(p => [p.school, p.college, p.majorCode, p.majorName].join(" ").toLowerCase().includes(q))
    : PROGRAMS;
  return list.slice(0, limit);
}
