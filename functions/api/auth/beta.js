// 内测码兑换（2026-11-22 版权分级）：
// GET  /api/auth/beta → 当前账号版本 { edition: 'normal' | 'beta' }
// POST /api/auth/beta { code } → 校验内测码并把账号升为内测版（一码一号，原子占用防并发）。
// 内测码由管理台生成（/api/admin action=betaCodes.create）；演示账号不配码，保持普通版。
import { ok, fail, readJson } from "../../_lib/http.js";
import { currentSession } from "../../_lib/security.js";
import { getUser } from "../../_lib/db.js";
import {
  ensureLayer1,
  effectiveEdition,
  normalizeBetaCode,
  getBetaCode,
  claimBetaCode,
  releaseBetaCode,
  setUserEdition,
} from "../../_lib/layer1.js";

const CODE_FORMAT = /^ATLAS-[A-Z0-9]{6}-[A-Z0-9]{6}$/;

async function currentUser(request, env) {
  const session = await currentSession(request, env).catch(() => null);
  if (!session) return { error: fail(401, "请先登录") };
  await ensureLayer1(env).catch(() => {});
  const user = await getUser(env, session.phone).catch(() => null);
  if (!user) return { error: fail(401, "账号不存在，请重新登录") };
  if (user.banned) return { error: fail(403, "账号已被封禁") };
  return { user };
}

export async function onRequestGet({ request, env }) {
  const gate = await currentUser(request, env);
  if (gate.error) return gate.error;
  return ok({ edition: effectiveEdition(env, gate.user) });
}

export async function onRequestPost({ request, env }) {
  const gate = await currentUser(request, env);
  if (gate.error) return gate.error;
  const { user } = gate;
  if (effectiveEdition(env, user) === "beta") {
    return ok({ edition: "beta", already: true });
  }
  const body = await readJson(request);
  const code = normalizeBetaCode(body?.code);
  if (!CODE_FORMAT.test(code)) return fail(400, "内测码格式不正确（应形如 ATLAS-XXXXXX-XXXXXX）");
  try {
    const row = await getBetaCode(env, code);
    if (!row) return fail(400, "内测码无效，请核对后重试");
    if (row.used_by) {
      // 同一个码被本人重复提交（双击/刷新重试）按已兑换处理，保持幂等
      if (row.used_by === user.phone) {
        await setUserEdition(env, user.phone, "beta");
        return ok({ edition: "beta", already: true });
      }
      return fail(400, "该内测码已被使用");
    }
    // 先原子占用再升版：占用失败说明被并发抢走；升版失败则释放占用，避免码被白白烧掉
    if (!(await claimBetaCode(env, code, user.phone))) {
      return fail(400, "该内测码已被使用");
    }
    try {
      await setUserEdition(env, user.phone, "beta");
    } catch (err) {
      await releaseBetaCode(env, code);
      throw err;
    }
    return ok({ edition: "beta" });
  } catch (err) {
    console.error("[auth/beta] 兑换失败", err);
    return fail(500, "兑换失败，请稍后再试");
  }
}
