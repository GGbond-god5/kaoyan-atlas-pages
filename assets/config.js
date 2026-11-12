/* 题库接入点：填入题库练习页地址后，每个考点底部会出现“去题库练这个考点”。
   链接会带上 ?subject=<科目>&chapter=<章节>&kp=<考点> 三个参数。 */
window.ATLAS_CONFIG = {
  bankBase: "bank.html",
  // AI 评卷：由本地 serve.py 或 server/ 代理，Key 不进浏览器
  gradeEndpoint: "/api/grade",

  /* 账号接口地址。
     本地/同域部署（Node 服务同时托管网页和接口）留空即可；
     网页放 Cloudflare Pages、接口放阿里云 ECS 时，填 ECS 的完整地址，例如：
       apiBase: "https://api.your-domain.com"
     如果暂时只有公网 IP 和端口，就是 "http://47.100.1.2:3000"（注意：http 会被浏览器拦截，
     线上务必给接口配 HTTPS）。 */
  apiBase: ""
};
