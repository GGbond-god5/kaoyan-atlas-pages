// 验证码校验的共用逻辑：注册和验证码登录都走这里
import { getCodeState, bumpCodeAttempt, clearCodeState } from "./db.js";
import { checkVerifyCode, smsMode } from "./sms.js";
import { sha256Hex } from "./security.js";

const MAX_ATTEMPTS = 5;

/**
 * @returns {Promise<null | {status:number, error:string}>} 成功返回 null
 */
export async function consumeCode(env, phone, code) {
  const state = await getCodeState(env, phone);
  if (!state) return { status: 400, error: "验证码已过期，请重新获取" };

  if (state.attempts >= MAX_ATTEMPTS) {
    await clearCodeState(env, phone);
    return { status: 429, error: "验证码错误次数过多，请重新获取" };
  }

  if (smsMode(env) === "pnvs") {
    let result;
    try {
      result = await checkVerifyCode(env, phone, code);
    } catch (err) {
      console.error("[sms] 核验失败", err.detail || err.message);
      return { status: 502, error: err.userMessage || "验证码校验服务暂时不可用，请稍后再试" };
    }
    if (!result.ok) {
      const n = await bumpCodeAttempt(env, phone);
      return { status: 400, error: `验证码不正确，还可以试 ${Math.max(MAX_ATTEMPTS - n, 0)} 次` };
    }
  } else {
    // mock：本地比对摘要
    const expect = await sha256Hex(`${phone}:${code}:${env.SESSION_SECRET || "atlas"}`);
    if (expect !== state.hash) {
      const n = await bumpCodeAttempt(env, phone);
      return { status: 400, error: `验证码不正确，还可以试 ${Math.max(MAX_ATTEMPTS - n, 0)} 次` };
    }
  }

  await clearCodeState(env, phone);
  return null;
}
