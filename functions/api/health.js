// GET /api/health —— 部署完先访问这里，确认配置齐了再点「获取验证码」
import { ok } from "../_lib/http.js";
import { smsMode, missingConfig } from "../_lib/sms.js";

export async function onRequestGet({ env }) {
  const mode = smsMode(env);
  return ok({
    service: "kaoyan-atlas",
    time: new Date().toISOString(),
    smsMode: mode,
    smsMissing: missingConfig(env),
    bindings: {
      D1: Boolean(env.DB),
      R2: Boolean(env.LIBRARY_FILES),
      SESSION_SECRET: Boolean(env.SESSION_SECRET),
      DASHSCOPE_API_KEY: Boolean(env.DASHSCOPE_API_KEY),
      RESEND_API_KEY: Boolean(env.RESEND_API_KEY),
      SMTP: Boolean(env.SMTP_USER && env.SMTP_PASS),
    },
    smsDevCode: env.SMS_DEV_CODE === "1",
    signName: mode === "pnvs" ? env.ALIYUN_SMS_SIGN_NAME || null : null,
    templateCode:
      mode === "pnvs"
        ? env.ALIYUN_SMS_TEMPLATE_CODE || env.ALIYUN_SMS_LOGIN_TEMPLATE_CODE || "100001"
        : null,
  });
}
