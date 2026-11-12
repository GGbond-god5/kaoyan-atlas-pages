'use strict';
/**
 * 阿里云短信验证码：支持两条通道，用 SMS_PROVIDER 切换。
 *
 *   pnvs  （默认，个人认证可用）号码认证服务 · 短信认证
 *        域名 dypnsapi.aliyuncs.com，Action SendSmsVerifyCode / CheckSmsVerifyCode
 *        无需申请资质、签名、模板：控制台赠送一套签名 + 标准模板（编号 100001）
 *        验证码由阿里云生成与核验。个人实名认证账号即可开通，是目前学生项目最现实的路径。
 *
 *   dysms （需企业认证）短信服务 Dysmsapi
 *        域名 dysmsapi.aliyuncs.com，Action SendSms
 *        必须自己申请签名和模板并通过运营商报备；验证码由本地生成、本地比对。
 *
 *   mock  不发真实短信，验证码打印在服务端控制台
 *
 * 两条通道都是 RPC 风格签名，共用下面同一套算法：
 *   1. 业务参数 + 公共参数 → 按 key 字典序排序
 *   2. 拼成 canonicalizedQueryString，再做 RFC3986 百分号编码
 *   3. StringToSign = "POST&%2F&" + 编码后的 canonicalizedQueryString
 *   4. Signature   = Base64(HMAC-SHA1(AccessKeySecret + "&", StringToSign))
 *   5. 把 Signature 一起放进 POST body（x-www-form-urlencoded）
 */
const crypto = require('node:crypto');

const API_VERSION = '2017-05-25';
const ENDPOINTS = {
  dysms: 'https://dysmsapi.aliyuncs.com/',
  pnvs: 'https://dypnsapi.aliyuncs.com/',
};

class SmsError extends Error {
  constructor(userMessage, detail) {
    super(userMessage);
    this.name = 'SmsError';
    this.userMessage = userMessage;
    this.detail = detail;
  }
}

function cfg() {
  return {
    keyId: (process.env.ALIYUN_ACCESS_KEY_ID || '').trim(),
    keySecret: (process.env.ALIYUN_ACCESS_KEY_SECRET || '').trim(),
    region: (process.env.ALIYUN_SMS_REGION || 'cn-hangzhou').trim(),
    signName: (process.env.ALIYUN_SMS_SIGN_NAME || '').trim(),
    templateCode: (process.env.ALIYUN_SMS_TEMPLATE_CODE || '').trim(),
    templateKey: (process.env.ALIYUN_SMS_TEMPLATE_PARAM_KEY || 'code').trim(),
  };
}

/** 缺少哪些必填项 */
function missing(provider) {
  const c = cfg();
  const need = [];
  if (!c.keyId) need.push('ALIYUN_ACCESS_KEY_ID');
  if (!c.keySecret) need.push('ALIYUN_ACCESS_KEY_SECRET');
  if (provider === 'dysms') {
    if (!c.signName) need.push('ALIYUN_SMS_SIGN_NAME');
    if (!c.templateCode) need.push('ALIYUN_SMS_TEMPLATE_CODE');
  }
  if (provider === 'pnvs') {
    if (!c.signName) need.push('ALIYUN_SMS_SIGN_NAME（控制台「短信认证」页面赠送的签名名称）');
    // 模板编号不填时默认用赠送的 100001（登录/注册），所以不算缺失
  }
  return need;
}

function mode() {
  const explicit = (process.env.SMS_PROVIDER || '').trim().toLowerCase();
  if (explicit === 'mock' || explicit === 'dysms' || explicit === 'pnvs') return explicit;
  if (!process.env.ALIYUN_ACCESS_KEY_ID || !process.env.ALIYUN_ACCESS_KEY_SECRET) return 'mock';
  return 'pnvs';
}

function isConfigured(provider = mode()) {
  if (provider === 'mock') return true;
  return missing(provider).length === 0;
}

/* ---------------- 签名 ---------------- */

function percentEncode(str) {
  // encodeURIComponent 会漏掉 ! ' ( ) * ，阿里云要求这几个也编码
  return encodeURIComponent(String(str)).replace(
    /[!'()*]/g,
    (ch) => '%' + ch.charCodeAt(0).toString(16).toUpperCase()
  );
}

function sign(params, keySecret) {
  const canonical = Object.keys(params)
    .sort()
    .map((k) => `${percentEncode(k)}=${percentEncode(params[k])}`)
    .join('&');
  const stringToSign = `POST&${percentEncode('/')}&${percentEncode(canonical)}`;
  const signature = crypto.createHmac('sha1', keySecret + '&').update(stringToSign).digest('base64');
  return { canonical, stringToSign, signature };
}

async function rpc(provider, action, business) {
  const c = cfg();
  const params = {
    AccessKeyId: c.keyId,
    Action: action,
    Format: 'JSON',
    RegionId: c.region,
    SignatureMethod: 'HMAC-SHA1',
    SignatureNonce: crypto.randomUUID(),
    SignatureVersion: '1.0',
    Timestamp: new Date().toISOString().replace(/\.\d{3}Z$/, 'Z'),
    Version: API_VERSION,
    ...business,
  };

  const { canonical, signature } = sign(params, c.keySecret);
  const body = `${canonical}&Signature=${percentEncode(signature)}`;

  let res;
  try {
    res = await fetch(ENDPOINTS[provider], {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=utf-8' },
      body,
      signal: AbortSignal.timeout(10000),
    });
  } catch (err) {
    throw new SmsError('无法连接阿里云短信服务，请检查服务器网络与 DNS', String(err));
  }

  let data;
  try {
    data = await res.json();
  } catch {
    throw new SmsError(`短信服务返回了非 JSON 响应（HTTP ${res.status}）`);
  }
  if (data.Code && data.Code !== 'OK') {
    throw new SmsError(friendly(data.Code, data.Message), data);
  }
  return data;
}

/* ---------------- 错误码翻译 ---------------- */

function friendly(code, message) {
  const map = {
    'isv.MOBILE_NUMBER_ILLEGAL': '手机号格式不正确',
    'isv.BUSINESS_LIMIT_CONTROL': '该号码发送过于频繁，请稍后再试',
    'isv.DAY_LIMIT_CONTROL': '该号码今日发送次数已达上限',
    'isv.SMS_SIGNATURE_ILLEGAL': '短信签名未审核通过或填写错误，请检查控制台「签名管理」',
    'isv.SMS_TEMPLATE_ILLEGAL': '短信模板未审核通过或填写错误，请检查控制台「模板管理」',
    'isv.TEMPLATE_PARAMS_ILLEGAL': '模板变量不匹配，请检查模板里的 ${code} 变量名',
    'isv.AMOUNT_NOT_ENOUGH': '短信账户余额不足，请先充值',
    'isv.OUT_OF_SERVICE': '短信服务已欠费停机',
    'isv.INVALID_ACCESS_KEY_ID': 'AccessKey 无效，请检查配置',
    'isv.RAM_PERMISSION_DENY': 'RAM 子账号缺少权限，请授予 AliyunDypnsFullAccess 或 AliyunDysmsFullAccess',
    'isv.PRODUCT_UN_SUBSCRIPT': '尚未开通对应产品，请先在控制台开通',
    'isv.INVALID_PARAMETERS': '请求参数不合法，请检查签名名称与模板编号是否与控制台一致',
    'isv.SMS_VERIFY_CODE_NOT_MATCH': '验证码不正确',
    'isv.SMS_VERIFY_CODE_EXPIRED': '验证码已过期，请重新获取',
    SignatureDoesNotMatch: '签名校验失败，请检查 AccessKeySecret 是否填写正确',
    InvalidAccessKeyId: 'AccessKeyId 不存在，请检查配置',
    Forbidden: 'RAM 子账号缺少短信权限',
  };
  return map[code] || `短信发送失败：${message || code}（${code}）`;
}

/* ---------------- 发送 ---------------- */

/**
 * 发送验证码。
 * @returns {Promise<{provider:string, code?:string, outId?:string, requestId?:string}>}
 *   provider = dysms 时返回本地生成的 code（调用方自行校验）；
 *   provider = pnvs 时返回 outId（校验时交给阿里云核对）。
 * @throws {SmsError}
 */
async function sendCode(phone) {
  const provider = mode();
  const c = cfg();

  if (provider === 'mock') {
    const code = String(crypto.randomInt(0, 1_000_000)).padStart(6, '0');
    console.log(
      [
        '',
        '  ┌─────────────────── 模拟短信（未真实发送） ───────────────────',
        `  │ 手机号：${phone}`,
        `  │ 验证码：${code}   （5 分钟内有效）`,
        '  │ 真实发送：server/.env 填好 AK，SMS_PROVIDER=pnvs',
        '  └────────────────────────────────────────────────────────────',
        '',
      ].join('\n')
    );
    return { provider: 'mock', code };
  }

  const lack = missing(provider);
  if (lack.length) {
    throw new SmsError(`短信服务配置不完整，缺少：${lack.join('、')}`, { provider, lack });
  }

  if (provider === 'pnvs') {
    // 验证码由阿里云生成；传 ##code## 占位符，CheckSmsVerifyCode 才能核验
    // 模板编号默认用赠送的 100001（登录/注册），签名也必须用赠送的签名，两者不能交叉搭配
    const data = await rpc('pnvs', 'SendSmsVerifyCode', {
      PhoneNumber: phone,
      SignName: c.signName,
      TemplateCode: c.templateCode || '100001',
      TemplateParam: JSON.stringify({ code: '##code##', min: '5' }),
      CodeLength: '6',
      ValidTime: '300',
      Interval: '60',
      ReturnVerifyCode: 'false',
    });
    const model = data.Model || {};
    return {
      provider: 'pnvs',
      outId: model.OutId || model.Outid || data.OutId || '',
      requestId: data.RequestId,
    };
  }

  // dysms：本地生成，走自定义模板
  const code = String(crypto.randomInt(0, 1_000_000)).padStart(6, '0');
  const data = await rpc('dysms', 'SendSms', {
    PhoneNumbers: phone,
    SignName: c.signName,
    TemplateCode: c.templateCode,
    TemplateParam: JSON.stringify({ [c.templateKey]: code }),
  });
  return { provider: 'dysms', code, requestId: data.RequestId, bizId: data.BizId };
}

/* ---------------- 核验 ---------------- */

/**
 * 交给阿里云核验（仅 pnvs 通道）。
 * @returns {Promise<{ok:boolean, status?:string}>}
 */
async function verifyCode({ phone, code, outId }) {
  const provider = mode();
  if (provider !== 'pnvs') return { ok: false, status: 'provider' };

  try {
    const data = await rpc('pnvs', 'CheckSmsVerifyCode', {
      PhoneNumber: phone,
      VerifyCode: code,
      ...(outId ? { OutId: outId } : {}),
    });
    const model = data.Model || {};
    const result = String(model.VerifyResult || '').toUpperCase();
    return { ok: result === 'PASS', status: result || 'UNKNOWN' };
  } catch (err) {
    // 验证码错误/过期时阿里云也会返回错误码，这里当作「校验不通过」而不是服务故障
    const codeName = err.detail && err.detail.Code;
    if (codeName && /VERIFY_CODE/i.test(codeName)) {
      return { ok: false, status: codeName };
    }
    throw err;
  }
}

module.exports = { sendCode, verifyCode, mode, isConfigured, missing, friendly, sign, percentEncode };
