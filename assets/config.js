/* 题库接入点：填入题库练习页地址后，每个考点底部会出现“去题库练这个考点”。
   链接会带上 ?subject=<科目>&chapter=<章节>&kp=<考点> 三个参数。 */
window.ATLAS_CONFIG = {
  bankBase: "bank.html",
  // AI 评卷：由本地 serve.py 代理，Key 不进浏览器
  gradeEndpoint: "/api/grade"
};
