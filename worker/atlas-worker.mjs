// 考研科目大观 · 服务器批改 worker
// 在 ECS 上常驻：轮询站点 /api/worker 领取 serverGrade 套卷，逐题请站点批改并写回。
// 批改逻辑、模型路由、额度记账都在站点侧，本服务只做调度，不持有 AI 密钥。
// 配置（环境变量）：ATLAS_SITE（默认 https://kaoyan-atlas-pages.pages.dev）、ATLAS_WORKER_TOKEN（必填）
const SITE = (process.env.ATLAS_SITE || 'https://kaoyan-atlas-pages.pages.dev').replace(/\/$/, '');
const TOKEN = process.env.ATLAS_WORKER_TOKEN || '';
const IDLE_MS = 20000;
const CONCURRENCY = 3; // 单卷内同时批的题数
const JOB_SLOTS = 2; // 同时处理的套卷数（claim 有租约保护，不会重复领同一卷）
const log = (...a) => console.log(new Date().toISOString(), ...a);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function call(body) {
  const r = await fetch(SITE + '/api/worker', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-worker-token': TOKEN },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(240000), // 站点侧单模型超时 60 秒，一道题整条模型链走完最长约 4 分钟
  });
  const j = await r.json().catch(() => null);
  if (!r.ok || !j || j.ok !== true) throw new Error((j && j.error) || 'HTTP ' + r.status);
  return j;
}

async function gradeJob(job) {
  log('领取套卷', job.attemptId, job.subject, job.mode, '待批', job.pending.length, '题');
  const queue = job.pending.slice();
  let cursor = 0, blocked = null;
  async function w() {
    while (cursor < queue.length) {
      const qid = queue[cursor++];
      // 单题失败先在本轮内重试一次（多为瞬时网络/网关抖动），再失败留待下轮领卷时续批
      let done = false;
      for (let attempt = 1; attempt <= 2 && !done && !blocked; attempt++) {
        try {
          const r = await call({ action: 'grade', uid: job.uid, attemptId: job.attemptId, questionId: qid });
          if (r.blocked) { blocked = r.blocked; return; }
          log('已批', job.attemptId, qid, '剩余', r.remaining);
          done = true;
        } catch (e) {
          log('批改失败', job.attemptId, qid, '第', attempt, '次：', e.message);
          if (attempt < 2) await sleep(5000);
        }
      }
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, w));
  if (blocked) {
    log('用户额度受限，释放套卷', job.attemptId, blocked);
    await call({ action: 'release', uid: job.uid, attemptId: job.attemptId }).catch(() => {});
  }
}

async function main() {
  if (!TOKEN) { console.error('缺少 ATLAS_WORKER_TOKEN，退出'); process.exit(1); }
  log('worker 启动，站点', SITE);
  let activeJobs = 0;
  for (;;) {
    if (activeJobs >= JOB_SLOTS) { await sleep(2000); continue; }
    try {
      const { job } = await call({ action: 'claim' });
      if (job && job.type === 'grade') {
        activeJobs++;
        gradeJob(job)
          .catch((e) => log('套卷处理异常', job.attemptId, e.message))
          .finally(() => { activeJobs--; });
        continue;
      }
    } catch (e) {
      log('轮询出错', e.message);
      await sleep(15000);
      continue;
    }
    await sleep(IDLE_MS);
  }
}
main();
