// 极简 SMTP 客户端：隐式 TLS（465）+ AUTH LOGIN，和 KPL 项目里 server.js 的做法一致。
// Workers 只能用 cloudflare:sockets 开 TCP，这里自己处理读写与多行回复。

import { connect } from "cloudflare:sockets";

const encoder = new TextEncoder();

function toBase64(bytes) {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 1) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

const b64 = (text) => toBase64(encoder.encode(String(text)));

function wrapBase64(value, width = 76) {
  return value.replace(new RegExp(`(.{${width}})`, "g"), "$1\r\n");
}

function buildMessage({ from, to, subject, text }) {
  const encodedSubject = `=?UTF-8?B?${b64(subject)}?=`;
  const body = wrapBase64(b64(text));
  return [
    `From: ${from}`,
    `To: ${to}`,
    `Subject: ${encodedSubject}`,
    "MIME-Version: 1.0",
    "Content-Type: text/plain; charset=utf-8",
    "Content-Transfer-Encoding: base64",
    "",
    body,
  ].join("\r\n");
}

export async function sendMail({
  host,
  port = 465,
  user,
  pass,
  from,
  to,
  subject,
  text,
  timeoutMs = 15000,
}) {
  const address = { hostname: host, port };
  // 465 是隐式 TLS，连上就是加密的；587 才是明文 + STARTTLS 升级
  const secure =
    Number(port) === 465
      ? connect(address, { secureTransport: "on" })
      : connect(address, { secureTransport: "starttls" }).startTls();
  const writer = secure.writable.getWriter();
  const reader = secure.readable.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let closed = false;

  const close = () => {
    if (closed) return;
    closed = true;
    try { writer.releaseLock(); } catch (e) { /* ignore */ }
    try { reader.releaseLock(); } catch (e) { /* ignore */ }
    try { secure.close(); } catch (e) { /* ignore */ }
  };

  const readReply = async () => {
    for (;;) {
      const idx = buffer.indexOf("\r\n");
      if (idx !== -1) {
        const line = buffer.slice(0, idx);
        buffer = buffer.slice(idx + 2);
        // 多行回复形如 "250-xxx"，续行要跳过，只取最后一行
        if (line.length < 4 || line[3] === "-") continue;
        return line;
      }
      const { value, done } = await reader.read();
      if (done) throw new Error("SMTP 连接意外关闭");
      buffer += decoder.decode(value, { stream: true });
    }
  };

  const step = async (line, expect) => {
    await writer.write(encoder.encode(`${line}\r\n`));
    const reply = await readReply();
    if (expect && !reply.startsWith(String(expect))) {
      throw new Error(`SMTP ${reply}`);
    }
    return reply;
  };

  const run = async () => {
    const greeting = await readReply();
    if (!greeting.startsWith("220")) throw new Error(`SMTP 连接异常：${greeting}`);
    await step(`EHLO kaoyan-atlas`, 250);
    await step("AUTH LOGIN", 334);
    await step(b64(user), 334);
    await step(b64(pass), 235);
    await step(`MAIL FROM:<${from}>`, 250);
    await step(`RCPT TO:<${to}>`, 250);
    await step("DATA", 354);
    await step(`${buildMessage({ from, to, subject, text })}\r\n.`, 250);
    try { await step("QUIT", 221); } catch (e) { /* 服务器可能已断开，邮件已经收下 */ }
  };

  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error("SMTP 超时")), timeoutMs);
  });

  try {
    await Promise.race([run(), timeout]);
    return { sent: true };
  } finally {
    clearTimeout(timer);
    close();
  }
}
