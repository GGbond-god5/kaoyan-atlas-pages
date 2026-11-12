// 阿里云短信认证（号码认证服务 PNVS）—— Pages Functions 版本
//
// 个人实名认证账号走「短信认证」，不需要资质/签名申请/模板审核：
//   Action: SendSmsVerifyCode / CheckSmsVerifyCode
//   域名:   dypnsapi.aliyuncs.com
//   赠送模板 100001（登录/注册），模板变量 ${code} 与 ${min}
//
// 签名算法与 Node 版一致，只是把 HMAC 换成 Web Crypto：
//   StringToSign = "POST&%2F&" + percentEncode(按 key 排序后的 k=v&k=v)
//   Signature   = Base64(HMAC-SHA1(AccessKeySecret + "&", StringToSign))

const enc = new TextEncoder();
const ENDPOINT = "https://dypnsapi.aliyuncs.com/";
const API_VERSION = "2017-05-25";

export class SmsError extends Error {
  constructor(userMessage, detail) {
    super(userMessage);
    this.name = "SmsError";
    this.userMessage = userMessage;
    this.detail = detail;
  }
}

export function smsMode(env) {
  if (env.ALIYUN_ACCESS_KEY_ID && env.ALIYUN_ACCESS_KEY_SECRET) return "pnvs";
  return "mock";
}

export function missingConfig(env) {
  const need = [];
  if (!env.ALIYUN_ACCESS_KEY_ID) need.push("ALIYUN_ACCESS_KEY_ID");
  if (!env.ALIYUN_ACCESS_KEY_SECRET) need.push("ALIYUN_ACCESS_KEY_SECRET");
  if (!env.ALIYUN_SMS_SIGN_NAME) need.push("ALIYUN_SMS_SIGN_NAME");
  return need;
}

function percentEncode(str) {
  return encodeURIComponent(String(str)).replace(
    /[!'()*]/g,
    (ch) => "%" + ch.charCodeAt(0).toString(16).toUpperCase()
  );
}

async function aliyunRpc(env, action, business) {
  const params = {
    AccessKeyId: env.ALIYUN_ACCESS_KEY_ID,
    Action: action,
    Format: "JSON",
    RegionId: env.ALIYUN_SMS_REGION || "cn-hangzhou",
    SignatureMethod: "HMAC-SHA1",
    SignatureNonce: crypto.randomUUID(),
    SignatureVersion: "1.0",
    Timestamp: new Date().toISOString().replace(/\.\d{3}Z$/, "Z"),
    Version: API_VERSION,
    ...business,
  };

  const canonical = Object.keys(params)
    .sort()
    .map((k) => `${percentEncode(k)}=${percentEncode(params[k])}`)
    .join("&");
  const stringToSign = `POST&${percentEncode("/")}&${percentEncode(canonical)}`;

  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(env.ALIYUN_ACCESS_KEY_SECRET + "&"),
    { name: "HMAC", hash: "SHA-1" },
    false,
    ["sign"]
  );
  const sigBuf = await crypto.subtle.sign("HMAC", key, enc.encode(stringToSign));
  let bin = "";
  for (const b of new Uint8Array(sigBuf)) bin += String.fromCharCode(b);
  const signature = btoa(bin);

  const body = `${canonical}&Signature=${percentEncode(signature)}`;

  let res;
  try {
    res = await fetch(ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded; charset=utf-8" },
      body,
    });
  } catch (err) {
    throw new SmsError("无法连接阿里云短信服务，请稍后再试", String(err));
  }

  let data;
  try {
    data = await res.json();
  } catch {
    throw new SmsError(`短信服务返回了非 JSON 响应（HTTP ${res.status}）`);
  }
  if (data.Code && data.Code !== "OK") {
    throw new SmsError(friendly(data.Code, data.Message), data);
  }
  return data;
}

function friendly(code, message) {
  const map = {
    "isv.MOBILE_NUMBER_ILLEGAL": "手机号格式不正确",
    "isv.BUSINESS_LIMIT_CONTROL": "该号码发送过于频繁，请稍后再试",
    "isv.DAY_LIMIT_CONTROL": "该号码今日发送次数已达上限",
    "isv.SMS_SIGNATURE_ILLEGAL": "短信签名与模板不匹配，请检查控制台赠送签名名称",
    "isv.SMS_TEMPLATE_ILLEGAL": "短信模板编号不正确",
    "isv.TEMPLATE_PARAMS_ILLEGAL": "模板变量不匹配，应为 {code, min}",
    "isv.AMOUNT_NOT_ENOUGH": "短信余额不足，请先充值",
    "isv.OUT_OF_SERVICE": "短信服务已欠费或未开通",
    "isv.RAM_PERMISSION_DENY": "RAM 子账号缺少 AliyunDypnsFullAccess 权限",
    "isv.PRODUCT_UN_SUBSCRIPT": "尚未开通「号码认证服务 - 短信认证」",
    "isv.INVALID_PARAMETERS": "请求参数不合法，请核对签名名称与模板编号",
    "isv.SMS_VERIFY_CODE_NOT_MATCH": "验证码不正确",
    "isv.SMS_VERIFY_CODE_EXPIRED": "验证码已过期，请重新获取",
    SignatureDoesNotMatch: "签名校验失败，请检查 AccessKeySecret",
    InvalidAccessKeyId: "AccessKeyId 不存在，请检查配置",
    Forbidden: "RAM 子账号缺少短信权限",
  };
  return map[code] || `短信发送失败：${message || code}（${code}）`;
}

/**
 * 发送验证码。
 * pnvs 模式下验证码由阿里云生成，本地不保存明文。
 * mock 模式下不真发短信，返回 code 交给调用方存哈希。
 */
export async function sendVerifyCode(env, phone) {
  const mode = smsMode(env);
  if (mode === "mock") {
    const code = String(crypto.getRandomValues(new Uint32Array(1))[0] % 1000000).padStart(6, "0");
    return { mode: "mock", code };
  }

  const lack = missingConfig(env);
  if (lack.length) {
    throw new SmsError(`短信服务未配置完整，缺少：${lack.join("、")}`, { lack });
  }

  const data = await aliyunRpc(env, "SendSmsVerifyCode", {
    PhoneNumber: phone,
    SignName: env.ALIYUN_SMS_SIGN_NAME,
    // 赠送模板只能配赠送签名；100001 = 登录/注册
    // 兼容控制台里按登录/绑定分开命名的模板变量
    TemplateCode:
      env.ALIYUN_SMS_TEMPLATE_CODE || env.ALIYUN_SMS_LOGIN_TEMPLATE_CODE || "100001",
    // ##code## 让阿里云生成验证码，CheckSmsVerifyCode 才能核验
    TemplateParam: JSON.stringify({ code: "##code##", min: "5" }),
    CodeLength: "6",
    ValidTime: "300",
    Interval: "60",
    ReturnVerifyCode: "false",
  });

  const model = data.Model || {};
  return {
    mode: "pnvs",
    outId: model.OutId || data.OutId || "",
    requestId: data.RequestId,
  };
}

/** 交给阿里云核验；返回 { ok, status } */
export async function checkVerifyCode(env, phone, code) {
  if (smsMode(env) !== "pnvs") {
    return { ok: false, status: "MOCK_NEEDS_LOCAL_CHECK" };
  }
  try {
    const data = await aliyunRpc(env, "CheckSmsVerifyCode", {
      PhoneNumber: phone,
      VerifyCode: code,
    });
    const result = String((data.Model || {}).VerifyResult || "").toUpperCase();
    return { ok: result === "PASS", status: result || "UNKNOWN" };
  } catch (err) {
    const codeName = err.detail && err.detail.Code;
    if (codeName && /VERIFY_CODE/i.test(codeName)) return { ok: false, status: codeName };
    throw err;
  }
}
