// Cloudflare Pages Function: DashScope (Qwen) grading proxy.
// Set DASHSCOPE_API_KEY in Pages project settings (secret) before use.

const API = "https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions";
const MODEL = "qwen3-vl-plus";

const SYSTEM =
  "你是考研阅卷老师，熟悉考研英语、政治、数学与材料力学的评分标准。" +
  "根据题目、参考答案、评分步骤和学生作答进行批改。" +
  "不要编造题目中没有的信息；看不清或未作答的部分要明确指出。" +
  "只输出一个 JSON，不要 markdown 代码块，字段固定为：" +
  '{"score": 数字, "level": "优秀/良好/合格/不合格", "comments": "2到4句总评", ' +
  '"missing": "缺失或错误的要点", "suggestions": "可操作的修改建议，分条用；分隔", ' +
  '"revised": "翻译/作文给润色后的范文或改译；其他题型留空字符串"}';

const HINTS = {
  小作文: "这是英语一小作文（应用文，10分）。按内容要点、格式与语域、语言准确性、连贯性评分；指出套话和语法错误，给出逐条修改建议与润色版。",
  大作文: "这是英语一大作文（20分）。按内容（描述、解释、评论）、结构、语言丰富度、语法与拼写评分；指出模板化表达，给出逐条修改建议与润色版。",
  翻译: "这是英语一翻译（10分）。逐句对照参考译文，指出误译、漏译、语序与用词问题，给出修改建议和参考改译。",
  分析题: "这是政治分析题。按采分点给分，指出遗漏的原理与材料结合点，给出答题框架。",
  计算题: "这是计算题。按步骤给分：思路、公式、代入、数值、单位、结论；指出第一处错误。",
  证明题: "这是证明题。检查条件使用、逻辑链条与结论，按证明步骤给分。",
  简答题: "这是简答题。按要点覆盖度与表述准确性给分。",
  选择题: "这是客观选择题。核对所选答案与参考答案是否一致，解释正确项与主要干扰项，不要改判参考答案。",
  单选题: "这是客观单选题。核对所选答案与参考答案是否一致，解释正确项与主要干扰项，不要改判参考答案。",
  多选题: "这是客观多选题。核对所选组合是否与参考答案完全一致，解释漏选与错选，不要改判参考答案。",
  阅读: "这是英语阅读题。核对所选答案，回文定位并解释正确项与干扰项，不要改判参考答案。",
  完形: "这是英语完形填空。核对所选答案，说明上下文线索与词义辨析，不要改判参考答案。",
  新题型: "这是英语新题型。核对所选答案，说明段落逻辑与衔接依据，不要改判参考答案。",
};

export async function onRequestPost(context) {
  const { request, env } = context;
  const key = env.DASHSCOPE_API_KEY;
  if (!key) return json({ error: "未配置 DASHSCOPE_API_KEY" }, 503);

  let payload;
  try {
    payload = await request.json();
  } catch (e) {
    return json({ error: "请求解析失败" }, 400);
  }

  const image = payload.image || "";
  const work = String(payload.work || "").trim();
  const selected = String(payload.selected || "").trim();
  if (image && (!image.startsWith("data:image/") || image.length > 16_000_000)) {
    return json({ error: "作答照片格式异常或过大" }, 400);
  }
  if (!image && !work && !selected) {
    return json({ error: "请先作答、勾选选项或上传照片" }, 400);
  }

  const kind = String(payload.kind || "").trim();
  const steps = Array.isArray(payload.steps) ? payload.steps : [];
  const hint = HINTS[kind] || "按题目要求与参考答案评分。";
  const text =
    `题型：${kind}\n科目：${payload.subject || ""}\n考点：${payload.kp || ""}\n` +
    `题目：${payload.question || ""}\n参考答案：${payload.answer || ""}\n` +
    `学生所选：${selected || "（未选）"}\n学生作答：${work || "（仅上传照片）"}\n` +
    `评分步骤：\n${steps.map((s, i) => `${i + 1}. ${s}`).join("\n")}\n评分要求：${hint}`;

  const content = [{ type: "text", text }];
  if (image) content.push({ type: "image_url", image_url: { url: image } });

  let res;
  try {
    res = await fetch(API, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          { role: "system", content: SYSTEM },
          { role: "user", content },
        ],
        temperature: 0.2,
        max_tokens: 1400,
      }),
    });
  } catch (e) {
    return json({ error: `模型调用失败：${e.message}` }, 502);
  }
  if (!res.ok) {
    return json({ error: `模型接口 HTTP ${res.status}` }, 502);
  }
  const data = await res.json();
  let out = data?.choices?.[0]?.message?.content ?? "";
  if (Array.isArray(out)) out = out.map((p) => p.text || "").join("");

  const m = out.match(/\{[\s\S]*\}/);
  if (m) {
    try {
      const parsed = JSON.parse(m[0]);
      parsed.model = MODEL;
      return json(parsed, 200);
    } catch (e) {
      /* fall through */
    }
  }
  return json({ score: null, level: "", comments: out, missing: "", suggestions: "", revised: "", model: MODEL }, 200);
}

function json(obj, code = 200) {
  return new Response(JSON.stringify(obj), {
    status: code,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
}
