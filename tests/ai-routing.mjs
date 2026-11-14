// 文本 / 视觉两条 AI 通道的路由规则
import assert from "node:assert/strict";
import { aiConfig, hasImagePart } from "../functions/_lib/platform.js";

const textOnly = [{ role: "user", content: "你好" }];
const withImage = [
  {
    role: "user",
    content: [
      { type: "text", text: "看看这道题" },
      { type: "image_url", image_url: { url: "data:image/png;base64,AA" } },
    ],
  },
];

assert.equal(hasImagePart(textOnly), false, "纯文本不该判定为图片");
assert.equal(hasImagePart(withImage), true, "带 image_url 应判定为图片");

const split = {
  AI_BASE_URL: "https://free.example/v1",
  AI_API_KEY: "text-key",
  AI_MODEL: "deepseek-default",
  AI_VISION_BASE_URL: "https://vision.example/v1",
  AI_VISION_API_KEY: "vision-key",
  AI_VISION_MODEL: "vl-model",
};

const text = aiConfig(split, false);
assert.equal(text.base, "https://free.example/v1");
assert.equal(text.key, "text-key");
assert.equal(text.model, "deepseek-default");

const vision = aiConfig(split, true);
assert.equal(vision.base, "https://vision.example/v1");
assert.equal(vision.key, "vision-key");
assert.equal(vision.model, "vl-model");

// 只配默认通道时，视觉回落到默认配置
const shared = aiConfig({ AI_BASE_URL: "https://same.example/v1/", AI_API_KEY: "k" }, true);
assert.equal(shared.base, "https://same.example/v1", "结尾斜杠要去掉");
assert.equal(shared.key, "k");
assert.equal(shared.model, "qwen3-vl-plus");

// 老部署只写了 DASHSCOPE_API_KEY 也要能用
const legacy = aiConfig({ DASHSCOPE_API_KEY: "legacy" }, false);
assert.equal(legacy.key, "legacy");
assert.equal(aiConfig({}, false).key, undefined);

console.log("ai routing ok");
